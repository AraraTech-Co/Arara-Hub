import express, { Express } from "express";
import passport from "passport";

export const bootConfig = (app: Express) => {
  app.use(express.json());
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: true }));
  app.use(passport.initialize());
};
