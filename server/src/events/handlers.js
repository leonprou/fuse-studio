const tokenUtils = require('@utils/token')
const eventUtils = require('@utils/event')
const bridgeDeployed = require('@utils/tokenProgress').bridgeDeployed

const handleTokenCreatedEvent = async (event) => {
  const blockNumber = event.blockNumber
  const eventArgs = event.returnValues
  const address = eventArgs.token
  const owner = eventArgs.issuer
  const factoryAddress = event.address
  const tokenData = await tokenUtils.fetchTokenData(address)

  return tokenUtils.createToken({owner, blockNumber, factoryAddress, ...tokenData})
}

const handleTransferEvent = (event) => {
  return Promise.resolve()
}

const handleBridgeMappingUpdatedEvent = (event) => {
  const tokenAddress = event.returnValues.foreignToken
  return bridgeDeployed(tokenAddress)
}

const eventsHandlers = {
  TokenCreated: handleTokenCreatedEvent,
  Transfer: handleTransferEvent,
  BridgeMappingUpdated: handleBridgeMappingUpdatedEvent
}

const handleEvent = function (eventName, event) {
  if (eventsHandlers.hasOwnProperty(eventName)) {
    return eventsHandlers[eventName](event).then(() => {
      const blockNumber = event.blockNumber
      console.log(`recieved ${eventName} event at ${blockNumber} blockNumber`)
      eventUtils.addNewEvent({
        eventName,
        ...event
      })
    })
  }
}

const handleReceipt = async (receipt) => {
  const events = Object.entries(receipt.events)
  let promisses = []
  for (let [eventName, event] of events) {
    if (eventsHandlers.hasOwnProperty(eventName)) {
      if (Array.isArray(event)) {
        const eventPromisses = event.map((singleEvent) => handleEvent(eventName, singleEvent))
        promisses = [...promisses, ...eventPromisses]
      } else {
        promisses.push(handleEvent(eventName, event))
      }
    }
  }
  return Promise.all(promisses)
}

module.exports = {
  handleEvent,
  handleReceipt
}