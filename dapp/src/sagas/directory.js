import { all, call, put, select, takeEvery } from 'redux-saga/effects'

import { getContract } from 'services/contract'
import * as actions from 'actions/directory'
import { apiCall, createEntitiesFetch, tryTakeEvery } from './utils'
import { getAccountAddress } from 'selectors/accounts'
import { getCommunityAddress } from 'selectors/directory'
import { getAddress } from 'selectors/network'
import { createMetadata, createEntitiesMetadata } from 'sagas/metadata'
import { processReceipt } from 'services/api/misc'
import * as tokenApi from 'services/api/token'
import * as entitiesApi from 'services/api/entities'
import { getHomeTokenAddress } from 'selectors/token'
import { transactionFlow } from './transaction'
import { roles } from '@fuse/roles'

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

function * confirmUser ({ account }) {
  const communityAddress = yield select(getCommunityAddress)
  const accountAddress = yield select(getAccountAddress)
  const CommunityContract = getContract({ abiName: 'Community',
    address: communityAddress
  })

  const method = CommunityContract.methods.addEnitityRoles(account, roles.APPROVED_ROLE)
  const transactionPromise = method.send({
    from: accountAddress
  })

  const action = actions.CONFIRM_USER
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
}

function * makeAdmin ({ account }) {
  const communityAddress = yield select(getCommunityAddress)
  const accountAddress = yield select(getAccountAddress)
  const CommunityContract = getContract({ abiName: 'Community',
    address: communityAddress
  })

  const method = CommunityContract.methods.addEnitityRoles(account, roles.ADMIN_ROLE)
  const transactionPromise = method.send({
    from: accountAddress
  })

  const action = actions.MAKE_ADMIN
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
}

function * removeAsAdmin ({ account }) {
  const communityAddress = yield select(getCommunityAddress)
  const accountAddress = yield select(getAccountAddress)
  const CommunityContract = getContract({ abiName: 'Community',
    address: communityAddress
  })

  const method = CommunityContract.methods.removeEnitityRoles(account, roles.ADMIN_ROLE)
  const transactionPromise = method.send({
    from: accountAddress
  })

  const action = actions.REMOVE_AS_ADMIN
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
}

function * addUser ({ communityAddress, data }) {
  const accountAddress = yield select(getAccountAddress)
  const CommunityContract = getContract({ abiName: 'Community',
    address: communityAddress
  })
  const method = CommunityContract.methods.addEntity(data.account, roles.USER_ROLE)
  const transactionPromise = method.send({
    from: accountAddress
  })

  const action = actions.ADD_ENTITY
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
  yield call(createEntitiesMetadata, { communityAddress, accountId: data.account, metadata: data })
}

function * addBusiness ({ communityAddress, data }) {
  const accountAddress = yield select(getAccountAddress)
  const CommunityContract = getContract({ abiName: 'Community',
    address: communityAddress
  })
  const method = CommunityContract.methods.addEntity(data.account, roles.BUSINESS_ROLE)
  const transactionPromise = method.send({
    from: accountAddress
  })
  const action = actions.ADD_ENTITY
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
  yield call(createEntitiesMetadata, { communityAddress, accountId: data.account, metadata: data })
}

function * addEntity ({ communityAddress, data }) {
  if (data.type === 'user') {
    yield call(addUser, { communityAddress, data })
  } else if (data.type === 'business') {
    yield call(addBusiness, { communityAddress, data })
  }
}

function * removeEntity ({ communityAddress, account }) {
  const accountAddress = yield select(getAccountAddress)
  const CommunityContract = getContract({ abiName: 'Community',
    address: communityAddress
  })
  const method = CommunityContract.methods.removeEntity(account)
  const transactionPromise = method.send({
    from: accountAddress
  })

  const action = actions.REMOVE_ENTITY
  yield call(transactionFlow, { transactionPromise, action, sendReceipt: true })
}

const fetchUsersEntities = createEntitiesFetch(actions.FETCH_USERS_ENTITIES, entitiesApi.fetchCommunityEntities)
const fetchBusinessesEntities = createEntitiesFetch(actions.FETCH_BUSINESSES_ENTITIES, entitiesApi.fetchCommunityEntities)

const fetchEntity = createEntitiesFetch(actions.FETCH_ENTITY, entitiesApi.fetchEntity)

function * fetchCommunity ({ tokenAddress }) {
  const { data } = yield apiCall(tokenApi.fetchCommunity, { tokenAddress })
  yield put({ type: actions.FETCH_COMMUNITY.SUCCESS,
    response: {
      ...data
    }
  })
}

function * watchEntityChanges ({ response }) {
  const communityAddress = yield select(getCommunityAddress)
  const { data } = response

  if (data) {
    const { type } = data
    if (type === 'user') {
      yield put(actions.fetchUsersEntities(communityAddress))
    } else if (type === 'business') {
      yield put(actions.fetchBusinessesEntities(communityAddress))
    }
  } else {
    yield put(actions.fetchUsersEntities(communityAddress))
    yield put(actions.fetchBusinessesEntities(communityAddress))
  }
}

export default function * businessSaga () {
  yield all([
    tryTakeEvery(actions.CREATE_LIST, createList, 1),
    tryTakeEvery(actions.ADD_ENTITY, addEntity, 1),
    tryTakeEvery(actions.REMOVE_ENTITY, removeEntity, 1),
    tryTakeEvery(actions.FETCH_COMMUNITY, fetchCommunity, 1),
    tryTakeEvery(actions.FETCH_USERS_ENTITIES, fetchUsersEntities, 1),
    tryTakeEvery(actions.FETCH_BUSINESSES_ENTITIES, fetchBusinessesEntities, 1),
    tryTakeEvery(actions.FETCH_ENTITY, fetchEntity, 1),
    tryTakeEvery(actions.MAKE_ADMIN, makeAdmin, 1),
    tryTakeEvery(actions.REMOVE_AS_ADMIN, removeAsAdmin, 1),
    tryTakeEvery(actions.CONFIRM_USER, confirmUser, 1),
    takeEvery(action => /^(CREATE_METADATA|REMOVE_ENTITY|MAKE_ADMIN|REMOVE_AS_ADMIN).*SUCCESS/.test(action.type), watchEntityChanges)
  ])
}
