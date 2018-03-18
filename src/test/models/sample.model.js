const mongoose = require('mongoose');
const Schema = mongoose.Schema;
import { eventLoggerPlugin, Logger } from '../../index';
const deepPopulate = require('mongoose-deep-populate')(mongoose);

module.exports = (dependencies) => {
  const db = dependencies.db;
  const SampleSchema = new Schema({
    name: String,
    items: [
      { type: Schema.ObjectId, ref: 'SampleItem' },
    ],
    code: String,
    strings: [String],
    createdAt: { type: Date, default: Date.now },
  });
  SampleSchema.plugin(deepPopulate);
  SampleSchema.plugin(eventLoggerPlugin(mongoose), { logger: Logger });
  db.model('Sample', SampleSchema);
};
