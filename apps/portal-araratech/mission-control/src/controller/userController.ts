import * as auth from "../model/schema/Auth/Auth";
import * as user from "../model/schema/User/User";
import * as utility from "../helper/utility";
import { Request, Response } from "express";

export const get = async (req: Request, res: Response): Promise<Response> => {
  const users = await user.get({});
  return res.status(200).send({ data: users });
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const data = req.body;

  const userData = await user.get({ id: req.params.id });
  utility.assert(userData.length, "User doesn't exist");

  if (data.email && data.email !== userData[0].email) {
    const exists = await user.get({ email: data.email });
    if (exists.length)
      throw { message: "This email address is already registered" };
  }

  await user.update({ id: req.params.id, data: data });
  return res.status(200).send({ message: `${data.email} has been updated` });
};

export const impersonate = async (req: Request, res: Response): Promise<Response> => {
  const userData = await user.get({ id: req.params.id });
  utility.assert(userData.length, "User does not exist");
  utility.assert(
    userData[0].support_enabled,
    "User has disabled impersonation"
  );

  const token = auth.token({
    data: { user_id: userData[0].id, permission: "master" },
    duration: 60,
  });
  return res.status(200).send({ data: { token } });
};

export const deleteUser = async (req: Request, res: Response): Promise<Response> => {
  await user.deleteUser(req.params.id);
  return res.status(200).send({ message: "User deleted" });
};