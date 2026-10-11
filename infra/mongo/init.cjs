// Runs only on a new volume. The API account cannot administer other databases.
const application = db.getSiblingDB('outsideweek');
application.createUser({user:'outsideweek',pwd:process.env.MONGO_APP_PASSWORD,roles:[{role:'readWrite',db:'outsideweek'}]});
