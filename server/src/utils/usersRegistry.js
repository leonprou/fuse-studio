const config = require('config')
const { web3, from, send } = require('@services/web3/home')
const UsersRegistryABI = require('@fuse/entities-contracts/build/abi/UsersRegistry')
const homeAddresses = config.get('web3.addresses.fuse')

const usersRegistryContract = new web3.eth.Contract(UsersRegistryABI, homeAddresses.UsersRegistry)

const addUser = async (account, userUri) => {
  const method = usersRegistryContract.methods.addUser(account, userUri)
  return send(method, {
    from
  })
}

module.exports = {
  addUser
}