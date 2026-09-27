import Model from "../model/Model";

export const create = async function(req, res) {
  const data = await Model.{{capitalisedName}}.create.new({
    ...req.body,
    account_id: req.account,
  });
  res.status(200).send({ message: '{{view}} created', data: data });
}

export const get = async function(req, res) {
  const data = await Model.{{capitalisedName}}.read.all({
    id: req.params.id,
    account_id: req.account,
  });
  res.status(200).send({ data: data });
}

export const update = async function(req, res) {
  await Model.{{capitalisedName}}.update.one(
    {
      id: req.params.id,
      account_id: req.account,
    },
    req.body,
  );
  res.status(200).send({ message: '{{view}} updated', data: req.body });
}

export const delete{{capitalisedName}} = async function(req, res) {
  await Model.{{capitalisedName}}.delete.one({
    id: req.params.id,
    account_id: req.account,
  });
  res.status(200).send({ message: '{{view}} deleted' });
}
