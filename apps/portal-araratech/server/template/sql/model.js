const prisma = require('../../prisma/client');
const { v4: uuidv4 } = require('uuid');

exports.create = async function(data, account){
  data.id = uuidv4();
  data.accountId = account;
  await prisma.{{view}}.create({ data });
  return data;
}

exports.get = async function(id, account){
  return await prisma.{{view}}.findMany({
    where: {
      accountId: account,
      ...(id && { id }),
    },
  });
}

exports.update = async function(id, data, account){
  await prisma.{{view}}.updateMany({
    where: { id, accountId: account },
    data,
  });
  return data;
}

exports.delete{{capitalisedName}} = async function(id, account){
  await prisma.{{view}}.deleteMany({
    where: { id, accountId: account },
  });
  return id;
}
