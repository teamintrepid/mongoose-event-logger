const mongoose = require('mongoose');
const Schema = mongoose.Schema;
import { eventLoggerPlugin, Logger } from '../../index';
module.exports = (dependencies) => {
  const db = dependencies.db;
  const SampleSubItemSchema = new Schema({
    name: String,
    createdAt: { type: Date, default: Date.now },
  });
  SampleSubItemSchema.plugin(eventLoggerPlugin(mongoose), { logger: Logger });
  db.model('SampleSubItem', SampleSubItemSchema);
};
