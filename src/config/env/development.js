const connectionString = process.env.EVENTS_LOGGER_DB_STRING;
const host = process.env.EVENTS_LOGGER_DB_HOST || 'localhost';
const port = process.env.EVENTS_LOGGER_DB_HOST_PORT || 27017;
const user = process.env.EVENTS_LOGGER_DB_USR;
const password = process.env.EVENTS_LOGGER_DB_PWD;

let url;
if (connectionString) {
  url = connectionString;
} else if (user) {
  url = `mongodb://${user}:${password}@${host}:${port}/event-log`;
} else {
  url = `mongodb://${host}:${port}/event-log`;
}
module.exports = {
  url,
  collection: 'events',
};
