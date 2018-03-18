const mongoose = require('mongoose');
const Schema = mongoose.Schema;
import { eventLoggerPlugin, Logger } from '../../index';
module.exports = (dependencies) => {
  const db = dependencies.db;
  const SampleItemSchema = new Schema({
    name: String,
    items: [
      { type: Schema.ObjectId, ref: 'SampleSubItem' },
    ],
    createdAt: { type: Date, default: Date.now },
  });
  SampleItemSchema.plugin(eventLoggerPlugin(mongoose), { logger: Logger, objectTypePrefix: 'L' });
  db.model('SampleItem', SampleItemSchema);
};
