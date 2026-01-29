const { DB } = require('./database/database.js');
const { Role } = require('../model/model.js');

function randomName() {
  return 'admin_' + Math.random().toString(36).substring(2, 8);
}

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';

  await DB.addUser(user);
  user.password = 'toomanysecrets';

  return user;
}

module.exports = { createAdminUser, randomName };
