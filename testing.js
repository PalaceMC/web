
if (process.env.NODE_ENV !== 'production') {
    // Development environment
    require('dotenv').config()
}

const util = require('util')
const { UUID } = require('bson')
const { ObjectId } = require('mongodb')
const NULL_OBJECTID_S = "000000000000000000000000"
const NULL_OBJECTID = new ObjectId(NULL_OBJECTID_S)
const NULL_UUID = new UUID(Buffer.alloc(16, 0)).toBinary()
//                   xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
const NULL_UUID_S = "00000000-0000-0000-0000-000000000000"
const { LimitedMap, sleep, resolveObjectPath, flattenObject } = require('./lib/palace-util')
const database = require('./lib/database')

const crypto = require('crypto')

async function main() {

    let r = await database.playerCount()
    console.log(r)

    //let me = await database.lookupPlayerByUUID('61408852-e247-4f91-8f4c-1e3fdbcd64fe')
    //console.log(me)

    //let r = await database.playerGetStats('61408852-e247-4f91-8f4c-1e3fdbcd64fe', 'survival.beta.kills')
    //console.log(r)

    //let r = await database.mailSave('3b2181ec-535b-4e49-bed4-76673046bb51', '61408852-e247-4f91-8f4c-1e3fdbcd64fe', 'My Ass', 'just testing API things get pranked haha')
    //console.log(util.inspect(r, undefined, 3, true))

    sleep(500)

    database.shutdown()

    //let nullId = new ObjectId("000000000000000000000000")

    //console.log(nullId.equals(NULL_OBJECTID))

    //return 'testin\''
}

main()
    .then(console.log)
    .catch(console.error)
