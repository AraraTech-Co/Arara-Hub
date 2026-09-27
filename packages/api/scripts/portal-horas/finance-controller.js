/**
 * GET /finance/investment-calculator?month=YYYY-MM
 * Identity from JWT (ctx.user.id). Admin Horas sees all staff users; others only self.
 */
async function handler(ctx) {
  const HOUR_TYPES = {
    NORMAL: 'NORMAL',
    EXTRA: 'EXTRA',
    BIP_STANDBY: 'BIP_STANDBY',
    BIP_ATTENDANCE: 'BIP_ATTENDANCE',
    BIP_BACKUP: 'BIP_BACKUP',
  };
  const COUNT_STATUSES = ['APPROVED', 'ADJUSTED'];
  const MONTHLY_REFERENCE_HOURS = 168;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  function asHours(min) {
    return Number((Number(min || 0) / 60).toFixed(2));
  }
  function toMoney(v) {
    return Number(Number(v || 0).toFixed(2));
  }
  function pick(obj, snake, camel) {
    return obj[snake] != null ? obj[snake] : obj[camel];
  }
  function countWorkingDays(year, monthNum, holidaySet) {
    const lastDay = new Date(year, monthNum, 0).getDate();
    let count = 0;
    for (let d = 1; d <= lastDay; d += 1) {
      const ymd = year + '-' + pad2(monthNum) + '-' + pad2(d);
      const dow = new Date(Date.UTC(year, monthNum - 1, d)).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (holidaySet.has(ymd)) continue;
      count += 1;
    }
    return count;
  }
  function resolveReferenceHourlyRate(user) {
    const hr = Number(pick(user, 'hourly_rate', 'hourlyRate') || 0);
    if (hr > 0) return hr;
    const mr = Number(pick(user, 'monthly_rate', 'monthlyRate') || 0);
    if (mr > 0) return mr / MONTHLY_REFERENCE_HOURS;
    return 0;
  }
  function computeIncremental(byType, hourlyRate) {
    const extraM = (byType[HOUR_TYPES.EXTRA] || 0) + (byType[HOUR_TYPES.BIP_ATTENDANCE] || 0);
    const standbyM = (byType[HOUR_TYPES.BIP_STANDBY] || 0) + (byType[HOUR_TYPES.BIP_BACKUP] || 0);
    const extraAndAttendanceHours = asHours(extraM);
    const standbyAndBackupHours = asHours(standbyM);
    const rate = Number(hourlyRate || 0);
    const extraAndAttendanceValue = toMoney(extraAndAttendanceHours * rate);
    const standbyAndBackupValue = toMoney(standbyAndBackupHours * rate * 0.3);
    const incrementalHours = Number(
      (extraAndAttendanceHours + standbyAndBackupHours).toFixed(2),
    );
    const incrementalTotal = toMoney(extraAndAttendanceValue + standbyAndBackupValue);
    return {
      extraAndAttendanceHours,
      extraAndAttendanceValue,
      standbyAndBackupHours,
      standbyAndBackupValue,
      incrementalHours,
      incrementalTotal,
    };
  }
  function aggregateMinutes(entries) {
    const byType = {};
    for (const e of entries) {
      const t = pick(e, 'hour_type', 'hourType');
      byType[t] = (byType[t] || 0) + Number(pick(e, 'duration_minutes', 'durationMinutes') || 0);
    }
    return byType;
  }
  function emptyTotals() {
    return {
      basePayment: 0,
      extraAndAttendanceHours: 0,
      extraAndAttendanceValue: 0,
      standbyAndBackupHours: 0,
      standbyAndBackupValue: 0,
      normalHours: 0,
      incrementalHours: 0,
      incrementalTotal: 0,
      totalCost: 0,
      pendingIncrementalCost: 0,
    };
  }

  const month = String((ctx.query && ctx.query.month) || '');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return ctx.reply.status(400).send({ error: 'Invalid month' });
  }
  const [ys, ms] = month.split('-');
  const year = Number(ys);
  const monthNum = Number(ms);
  if (monthNum < 1 || monthNum > 12) {
    return ctx.reply.status(400).send({ error: 'Invalid month' });
  }

  const monthStart = year + '-' + pad2(monthNum) + '-01';
  const lastDate = new Date(year, monthNum, 0);
  const monthEnd = year + '-' + pad2(monthNum) + '-' + pad2(lastDate.getDate());

  const Profile = ctx.models.StaffProfile;
  const HourEntries = ctx.models.HourEntries;
  const Holidays = ctx.models.Holidays;
  if (!Profile || !HourEntries || !Holidays) {
    return ctx.reply.status(500).send({ error: 'Required models missing' });
  }

  const requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required for finance data' });
  }

  const allHolidays = await Holidays.findMany({ limit: 500 });
  const holidaySet = new Set();
  for (const h of allHolidays) {
    const d = String(pick(h, 'date', 'date') || '').slice(0, 10);
    if (d >= monthStart && d <= monthEnd) holidaySet.add(d);
  }

  const workingDays = countWorkingDays(year, monthNum, holidaySet);
  const expectedHours = Number((workingDays * 8).toFixed(2));
  const baseMeta = {
    month,
    monthStart,
    monthEnd,
    workingDaysInMonth: workingDays,
    expectedHoursDefault: expectedHours,
  };

  const self = await Profile.findById(String(requester.id));
  const roles = (requester && requester.roles) || [];
  const selfRole = String((self && pick(self, 'role', 'role')) || '');
  // Admin view: platform admin OR Horas admin/master (legacy "role=user" staff filter broke after canonical roles).
  const isAdmin =
    roles.indexOf('admin') >= 0 || selfRole === 'admin' || selfRole === 'master';

  function isFinanceStaff(u) {
    if (pick(u, 'active', 'active') === false) return false;
    const r = String(pick(u, 'role', 'role') || '').toLowerCase();
    // Exclude platform/Horas admins from the company rollup; include support/developer/user/etc.
    if (r === 'admin' || r === 'master') return false;
    return true;
  }

  let profiles;
  if (isAdmin) {
    const all = await Profile.findMany({ limit: 500 });
    profiles = all.filter(isFinanceStaff);
  } else {
    if (!self) return ctx.reply.status(403).send({ error: 'No finance data for this user' });
    profiles = [self];
  }

  if (!profiles.length) {
    return ctx.reply.send(Object.assign({}, baseMeta, { rows: [], totals: emptyTotals() }));
  }

  const rows = [];
  let totals = emptyTotals();

  for (const u of profiles) {
    const userId = String(u.id);
    // Prefer snake filter; also accept camel if storage uses it. Cap high enough for month rollups.
    let allEntries = await HourEntries.findMany({ user_id: userId, limit: 2000 });
    if (!allEntries.length) {
      allEntries = await HourEntries.findMany({ userId: userId, limit: 2000 });
    }
    const inMonth = allEntries.filter((e) => {
      const d = String(pick(e, 'date', 'date') || '').slice(0, 10);
      const uid = String(pick(e, 'user_id', 'userId') || '');
      if (uid && uid !== userId) return false;
      return d >= monthStart && d <= monthEnd;
    });
    const approved = inMonth.filter((e) =>
      COUNT_STATUSES.includes(String(pick(e, 'status', 'status') || '')),
    );
    const pending = inMonth.filter((e) => String(pick(e, 'status', 'status') || '') === 'PENDING');

    const byType = aggregateMinutes(approved);
    const pendingByType = aggregateMinutes(pending);
    const normalHours = asHours(byType[HOUR_TYPES.NORMAL] || 0);
    const rate = resolveReferenceHourlyRate(u);
    const inc = computeIncremental(byType, rate);
    const pendingInc = rate > 0 ? computeIncremental(pendingByType, rate).incrementalTotal : 0;
    const basePayment = toMoney(Number(pick(u, 'monthly_rate', 'monthlyRate') || 0));
    const totalCost = toMoney(basePayment + inc.incrementalTotal);

    rows.push({
      userId,
      fullName: pick(u, 'full_name', 'fullName') || u.email,
      email: u.email,
      squad: pick(u, 'squad', 'squad') || null,
      rateType: pick(u, 'rate_type', 'rateType') || null,
      monthlyRate:
        pick(u, 'monthly_rate', 'monthlyRate') != null
          ? Number(pick(u, 'monthly_rate', 'monthlyRate'))
          : null,
      referenceHourlyRate: toMoney(rate),
      hasRateWarning: rate <= 0,
      workingDaysInMonth: workingDays,
      expectedHours,
      normalHours,
      extraAndAttendanceHours: inc.extraAndAttendanceHours,
      extraAndAttendanceValue: inc.extraAndAttendanceValue,
      standbyAndBackupHours: inc.standbyAndBackupHours,
      standbyAndBackupValue: inc.standbyAndBackupValue,
      incrementalHours: inc.incrementalHours,
      incrementalTotal: inc.incrementalTotal,
      basePayment,
      totalCost,
      pendingIncrementalCost: pendingInc,
    });

    totals.basePayment = toMoney(totals.basePayment + basePayment);
    totals.normalHours = toMoney(totals.normalHours + normalHours);
    totals.extraAndAttendanceHours = toMoney(
      totals.extraAndAttendanceHours + inc.extraAndAttendanceHours,
    );
    totals.extraAndAttendanceValue = toMoney(
      totals.extraAndAttendanceValue + inc.extraAndAttendanceValue,
    );
    totals.standbyAndBackupHours = toMoney(
      totals.standbyAndBackupHours + inc.standbyAndBackupHours,
    );
    totals.standbyAndBackupValue = toMoney(
      totals.standbyAndBackupValue + inc.standbyAndBackupValue,
    );
    totals.incrementalHours = toMoney(totals.incrementalHours + inc.incrementalHours);
    totals.incrementalTotal = toMoney(totals.incrementalTotal + inc.incrementalTotal);
    totals.totalCost = toMoney(totals.totalCost + totalCost);
    totals.pendingIncrementalCost = toMoney(totals.pendingIncrementalCost + pendingInc);
  }

  rows.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
  return ctx.reply.send(Object.assign({}, baseMeta, { rows, totals }));
}
module.exports = { handler };
