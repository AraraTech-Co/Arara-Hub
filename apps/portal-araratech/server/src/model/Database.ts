import * as dotenv from "dotenv";
import prisma from "./prisma";
import {
  Account,
  Event,
  Feedback,
  Invite,
  Key,
  Log,
  Login,
  Token,
  Preview,
  Plan,
  User,
} from "./schema";
dotenv.config();

abstract class Database {
  public static async connect(): Promise<void> {
    try {
      await prisma.$connect();
      console.log("Connected to PostgreSQL 👍");
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  public static async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }

  public static Account = new Account();
  public static Event = new Event();
  public static Feedback = new Feedback();
  public static Invite = new Invite();
  public static Key = new Key();
  public static Log = new Log();
  public static Login = new Login();
  public static Token = new Token();
  public static Preview = new Preview();
  public static Plan = new Plan();
  public static User = new User();
}

export default Database;
