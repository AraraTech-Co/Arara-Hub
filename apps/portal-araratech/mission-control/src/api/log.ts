import express from 'express';
import * as auth from '../model/schema/Auth/Auth';
import * as logController from '../controller/logController';
import { use } from '../helper/utility';

const api = express.Router();

api.get('/api/log', auth.verify('master'), use(logController.get));

api.get('/api/log/:id', auth.verify('master'), use(logController.get));

api.delete('/api/log/:id', auth.verify('master'), use(logController.deleteLog));

export default api;