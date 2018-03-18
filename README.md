# Mongoose Event Logger

> Granular change logging for your [Mongoose](http://mongoosejs.com/) models

> Which model was updated, what was changed, when and by who?


[![NPM version](https://img.shields.io/npm/v/mongoose-event-logger.svg)](https://npmjs.org/package/mongoose-event-logger)
[![Build status](https://img.shields.io/travis/teamintrepid/mongoose-event-logger.svg)](https://travis-ci.org/teamintrepid/mongoose-event-logger)


## Installation

```sh
npm install mongoose-event-logger
```

## Quick Start

#### Setup

```js
import mongoose from 'mongoose';
import { eventLoggerPlugin, Logger } from 'mongoose-event-logger';

const dogSchema = new mongoose.Schema({
  name: String
});

dogSchema.plugin(eventLoggerPlugin(mongoose), { logger: Logger });

const Dog = mongoose.model('Dog', dogSchema);
```

#### Usage
```js
Logger.init({
  url: `mongodb://localhost:27017/event-log`,
  collection: 'events'
});

const dog = new Dog({ name: 'Cookie' });
dog.by('bob@exmaple.com').save();
```


## Example Output

Running this:
```js
const dog = await Dog.findOne({ name: 'Cookie' });
dog.name = 'Rover';
await dog.by('bob@example.com').save();
```

Will save the following to the events database:
```
{
    "_id" : ObjectId("5aadcc864c7fd8631a35388f"),
    "object" : {
        "__v" : 0,
        "_id" : ObjectId("5aadcc855df61e1a63490c67"),
        "__delta" : {
            "__v" : 0,
            "name" : "Rover",
            "_id" : ObjectId("5aadcc855df61e1a63490c67")
        },
        "__logBehaviour" : "delta"
    },
    "objectType" : "Dog",
    "action" : "updated",
    "actor" : "bob@exmple.com",
    "when" : ISODate("2018-03-18T02:18:46.101Z"),
    "attributes" : null,
    "callStack" : [ 
        "src/index.js:10:20"
    ]
}
```


## Configuration

### Logger Configuration
When initialising the logger, the database is configurable
```js
Logger.init({
  url: `mongodb://localhost:27017/event-log`,
  collection: 'events'
})
```

| Variable      | Description   
| ------------- |:-------------|
| url           | The url of the mongo database to log the events to. It is recommended to use a different database to your application's db|
| collection    | The name of the collection to store events in |



### Model Configuration
The event logger allows different logging behaviour to be configured based on the type of database modification (create, update, delete) and /or based on the actor that performed the action (system process or user).


```js
await new Dog({ name: 'Cookie' }).by('system').save(); // logs with system behaviour
await new Dog({ name: 'Rover' }).by('john@example.com').save(); // logs with user behaviour
```


#### Logging Behaviour
* **delta**: Only stores the difference between the two objects, i.e. the properties that were actually changed. 
* **snapshot**: Stores a snapshot of the entire object at the time it was updated
* **snapshotAndDelta**: Stores the snapshot as well as the difference form pre-update to post-update
* **id**: Only stores the id of the object which was changed


##### Default Behaviour
```
// If changed by a system actor
`if.${Action.created}.by.${Actor.system}` = Behaviour.snapshot;
`if.${Action.updated}.by.${Actor.system}` = Behaviour.delta;
`if.${Action.deleted}.by.${Actor.system}` = Behaviour.snapshot;

// If changed by a user actor
`if.${Action.deleted}.by.${Actor.user}` = Behaviour.snapshot;
`if.${Action.created}.by.${Actor.user}` = Behaviour.snapshot;
`if.${Action.updated}.by.${Actor.user}` = Behaviour.delta;
```

##### Setting the Config

```js
  import { Actor, Behaviour, Action } from 'mongoose-events-logger';

  const options = Dog.loggingOptions();
  options.if[Action.updated].by[Actor.user] = Behaviour.snapshotAndDelta;
  options.if[Action.created].by[Actor.user] = Behaviour.snapshotAndDelta;
  options.if[Action.deleted].by[Actor.user] = Behaviour.snapshotAndDelta;
  Dog.setLoggingOptions(options);
```


#### Ignore attributes
You can optionally choose to ignore specific attributes on your model that will be ignored by the events logger when performing updates on a model. 


```
Dog.setLoggingOptions({ skip: ['name'] });
```


---

### Compatible Versions
Node >= 5

Mongoose >= 4.4


### Contributors
[Mikhail Asavkin](https://github.com/limenutt)

[Paul Pagnan](https://github.com/paul-pagnan)


### Tests

```sh
npm install
npm test
```

### License

[MIT](LICENSE)