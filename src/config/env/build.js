const host = process.env.MONGO_PORT_27017_TCP_ADDR || 'int-db.kentandlime.com.au';
const port = process.env.MONGO_PORT_27017_TCP_PORT || 27017;

module.exports = {
  url: `mongodb://${host}:${port}/event-log`,
  collection: 'events',
};
