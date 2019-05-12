import { all, call, put, select } from 'redux-saga/effects'

import { getContract } from 'services/contract'
import * as actions from 'actions/directory'
import { apiCall, createEntitiesFetch, tryTakeEvery } from './utils'
import { getAccountAddress } from 'selectors/accounts'
import { getAddress } from 'selectors/network'
import { createMetadata, createEntitiesMetadata } from 'sagas/metadata'
// import { isZeroAddress } from 'utils/web3'
import { processReceipt } from 'services/api/misc'
import * as tokenApi from 'services/api/token'
import { getHomeTokenAddress } from 'selectors/token'
import * as api from 'services/api/business'
import { transactionFlow } from './transaction'

function * createList ({ tokenAddress }) {
  const accountAddress = yield select(getAccountAddress)
  const contractAddress = yield select(getAddress, 'SimpleListFactory')
  const SimpleListFactoryContract = getContract({ abiName: 'SimpleListFactory',
    address: contractAddress
  })
  const homeTokenAddress = yield select(getHomeTokenAddress, tokenAddress)

  const method = SimpleListFactoryContract.methods.createSimpleList(homeTokenAddress)
  const receipt = yield method.send({
    from: accountAddress
  })

  yield apiCall(processReceipt, { receipt })

  yield put({ type: actions.CREATE_LIST.SUCCESS,
    tokenAddress,
    response: {
      listAddress: receipt.events.SimpleListCreated.returnValues.list
    }
  })
}

function * getList ({ tokenAddress }) {
  const contractAddress = yield select(getAddress, 'SimpleListFactory')
  const options = { bridgeType: 'home' }
  const SimpleListFactoryContract = getContract({
    abiName: 'SimpleListFactory',
    address: contractAddress,
    options
  })

  const listAddress = yield SimpleListFactoryContract.methods.tokenToListMap(tokenAddress).call()

  yield put({ type: actions.GET_LIST.SUCCESS,
    response: {
      // listAddress: isZeroAddress(listAddress) ? null : listAddress
      listAddress: '0xe76810AE61D68b1d06B1eC4946d358F4092565d3'
    } })
  return listAddress
}

function * addUser ({ communityAddress, data }) {
  const accountAddress = yield select(getAccountAddress)
  const CommunityContract = getContract({ abiName: 'Community',
    address: communityAddress
  })
  yield call(createEntitiesMetadata, { accountId: data.account, metadata: data })
  const userRoles = '0x0000000000000000000000000000000000000000000000000000000000000001'
  const method = CommunityContract.methods.addEntity(data.account, userRoles)
  const transactionPromise = method.send({
    from: accountAddress
  })

  const action = actions.ADD_ENTITY
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
}

function * addBusiness ({ communityAddress, data }) {
  const accountAddress = yield select(getAccountAddress)
  const CommunityContract = getContract({ abiName: 'Community',
    address: communityAddress
  })
  const businessRoles = '0x0000000000000000000000000000000000000000000000000000000000000008'
  const method = CommunityContract.methods.addEntity(data.account, businessRoles)
  const transactionPromise = method.send({
    from: accountAddress
  })
  const action = actions.ADD_ENTITY
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
  const response = yield call(createEntitiesMetadata, { accountId: data.account, metadata: data })
  console.log({ response })
}

function * addEntity ({ communityAddress, data }) {
  if (data.type === 'user') {
    yield call(addUser, { communityAddress, data })
  } else if (data.type === 'business') {
    yield call(addBusiness, { communityAddress, data })
  }
}

function * removeEntity ({ listAddress, hash }) {
  const accountAddress = yield select(getAccountAddress)
  const SimpleListContract = getContract({ abiName: 'SimpleList',
    address: listAddress
  })

  const transactionPromise = SimpleListContract.methods.deleteEntity(hash).send({
    from: accountAddress
  })

  const action = actions.REMOVE_DIRECTORY_ENTITY
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
}

function * editEntity ({ listAddress, hash, data }) {
  const accountAddress = yield select(getAccountAddress)

  const SimpleListContract = getContract({ abiName: 'SimpleList',
    address: listAddress
  })

  const response = yield call(createMetadata, { metadata: data })
  const newHash = response.hash

  const transactionPromise = SimpleListContract.methods.replaceEntity(hash, newHash).send({
    from: accountAddress
  })

  const action = actions.EDIT_ENTITY
  return yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
}

export function * activateBusiness ({ listAddress, hash }) {
  const data = yield select(state => state.entities.metadata[`ipfs://${hash}`])
  const receipt = yield editEntity({ listAddress, hash, data: { ...data, active: true } })
  yield put({ type: actions.ACTIVATE_BUSINESS.SUCCESS,
    response: {
      receipt
    }
  })
}

export function * deactivateBusiness ({ listAddress, hash }) {
  const data = yield select(state => state.entities.metadata[`ipfs://${hash}`])
  const receipt = yield editEntity({ listAddress, hash, data: { ...data, active: false } })
  yield put({ type: actions.DEACTIVATE_BUSINESS.SUCCESS,
    response: {
      receipt
    }
  })
}

const fetchBusinesses = createEntitiesFetch(actions.FETCH_BUSINESSES, api.fetchBusinesses)
const fetchBusiness = createEntitiesFetch(actions.FETCH_BUSINESS, api.fetchBusiness)

// const fetchEntities = createEntitiesFetch(actions.FETCH_BUSINESS, api.fetchBusiness)

function * fetchCommunity ({ tokenAddress }) {
  const { data } = yield apiCall(tokenApi.fetchCommunity, { tokenAddress })
  yield put({ type: actions.FETCH_COMMUNITY.SUCCESS,
    response: {
      ...data
    }
  })
}

function * fetchEntities ({ communityAddress }) {
  const { data } = yield apiCall(tokenApi.fetchCommunityEntities, { communityAddress })

  yield put({ type: actions.FETCH_ENTITIES.SUCCESS,
    response: {
      entities: {
        ...data
      }
    }
  })
}

export default function * businessSaga () {
  yield all([
    tryTakeEvery(actions.CREATE_LIST, createList, 1),
    tryTakeEvery(actions.GET_LIST, getList, 1),
    tryTakeEvery(actions.ADD_ENTITY, addEntity, 1),
    tryTakeEvery(actions.REMOVE_ENTITY, removeEntity, 1),
    tryTakeEvery(actions.EDIT_ENTITY, editEntity, 1),
    tryTakeEvery(actions.FETCH_BUSINESSES, fetchBusinesses, 1),
    tryTakeEvery(actions.FETCH_BUSINESS, fetchBusiness, 1),
    tryTakeEvery(actions.ACTIVATE_BUSINESS, activateBusiness, 1),
    tryTakeEvery(actions.DEACTIVATE_BUSINESS, deactivateBusiness, 1),
    tryTakeEvery(actions.FETCH_COMMUNITY, fetchCommunity, 1),
    tryTakeEvery(actions.FETCH_ENTITIES, fetchEntities, 1)
  ])
}