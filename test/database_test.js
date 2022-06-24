
if (process.env.NODE_ENV !== 'production') {
    // Development environment
    require('dotenv').config()
}

const assert = require('assert')

const { UUID } = require('bson')
const { MongoClient, ServerApiVersion } = require('mongodb')

const database = require('../lib/database')

const almicUUID = '61408852-e247-4f91-8f4c-1e3fdbcd64fe'
const almicProfile = {
    uuid: almicUUID,
    firstLogin: 1569587100000,
    name: 'almic',
    nameStyle: {
        color: '95f0eb',
        colorB: 'cff8f6',
        bold: true
    }
}
const animalclinicUUID = 'aabc4b20-c14a-4ead-94fa-5d594042a57d'
const animalclinicProfile = {
    uuid: animalclinicUUID,
    firstLogin: 1571271180000,
    name: 'animalclinic',
    nameStyle: {}
}
const testPlayerUUID = '5b084158-b400-4ba7-88fe-7b730f2627db'
const testPlayerUUIDBin = new UUID(testPlayerUUID).toBinary()
const testPlayerProfile = {
    uuid: testPlayerUUID,
    firstLogin: 0, // will be updated in testing
    name: 'animalclinic', // set to 'animalclinic' as it will be this when tested
    nameStyle: {}
}
const nonePlayerUUID = '4f16bc54-a296-40ea-bb51-ba6b04ad42c1'

describe('Database', function () {

    before(async function () {

        console.log('\x1b[33mNote: These tests alter the database, and so failures may \"fix\" themselves.')
        console.log('If any tests fail, note them down, and rerun the suite to see if they change or resolve themselves.\n')

        process.stdout.write('  \x1b[36m') // indent and color connection message
        let r = await database.logSave('test')
        process.stdout.write('\x1b[39m\x1b[1F') // move up one line, so no empty gap

        if (!r.success)
            throw new Error(r.error)

    })

    describe('chat', function () {

        // TODO: test inputs and save chat message for later
        describe('chatSave()', function () {

            it('error on null/ undefined parameters')

            it('error with non-object values')

            it('error on missing receivers for pm and group type')

            it('only accept string receiver for pm type, no array')

            it('error on null/ undefined properties')

            it('error on malformed properties')

            it('save normal message + defaults')

            it('save cropped message')

            it('save private/ group messages')

            it('save poorly timed message')

        })

        // TODO: test inputs and find chat message saved earlier
        describe('chatGet', function () {

            it('error on null/ undefined uuid')

            it('error on invalid parameters')

            it('retrieve all player chats, all defaults')

            it('find previously saved chats in correct format')

            it('find chats by time, in proper order')

            it('find chats by type and !type')

            it('paginate chats')

        })

    })

    describe('discord', function () {

        describe('discordGetServers()', function () {

            it('works')

        })

    })

    describe('logSave()', function () {

        it('error on null/ undefined message')

        it('error on invalid parameter')

        it('save normal log')

        it('save cropped log')

    })

    describe('mail', function () {

        describe('mailSave()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('save normal mail')

            it('save cropped mail')

        })

        describe('mailGet()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('get no results for no mail')

            it('get previously saved mail, to')

            it('get previously saved mail, from')

        })

        describe('mailRead()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on mail not found')

            it('mark previous mail as read')

        })

        describe('mailDelete()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on missing mail')

            it('delete mail')

        })

    })

    describe('moderationMute()', function () {

        it('error on null/ undefined uuid')

        it('error on invalid parameters')

        it('empty for player not found', async function () {

            let r = await database.moderationMute(nonePlayerUUID, null)

            assert.deepStrictEqual(r, {})

        })

        it('mutes player for time', async function () {

            let mute = Date.now() + 5000 // adding time isn't really necessary but whatever

            let r = await database.moderationMute(animalclinicUUID, mute)

            assert.deepStrictEqual(r, {success: 1})

            // retrieve and test mute time set correctly

            r = await database.moderationMute(animalclinicUUID, '?')

            assert.deepStrictEqual(r, {time: mute})

        })

        it('unmutes player (default)', async function () {

            let r = await database.moderationMute(animalclinicUUID) // single argument defaults to unmute

            assert.deepStrictEqual(r, {success: 1})

            // retrieve and test mute was set to null

            r = await database.moderationMute(animalclinicUUID, '?')

            assert.deepStrictEqual(r, {time: null})

        })

    })

    describe('player', function () {

        describe('playerCount()', function () {

            it('works')

        })

        describe('playerCountCache()', function () {

            it('works')

        })

        describe('playerLogin()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('login existing player', async function () {

                let r = await database.playerLogin(almicUUID, "almic")

                let time = r.time // copy time

                assert.deepStrictEqual(r, {time})

            })

            it('login new player', async function () {

                let r = await database.playerLogin(testPlayerUUID, "Elite2738")

                let time = r.time // copy time

                assert.deepStrictEqual(r, {time, new: true})

                // save to test profile
                testPlayerProfile.firstLogin = time

            })

            it('login and changes name', async function () {

                let r = await database.playerLogin(testPlayerUUID, "animalclinic") // set to "animalclinic" for multiple player finds in later test

                let time = r.time // copy time

                assert.deepStrictEqual(r, {time, oldName: "Elite2738"})

            })

        })

        describe('playerByName()', function () {

            it('error on null/ undefined name')

            it('error on invalid name')

            it('error on malicious input')

            it('finds no player', async function () {

                let r = await database.playerByName('hypixel') // lol

                assert.deepStrictEqual(r, {count: 0, players: []})

            })

            it('finds single player', async function () {

                let r = await database.playerByName('almic')

                assert.deepStrictEqual(r, {count: 1, players: [almicProfile]})

            })

            it('finds multiple players', async function () {

                let r = await database.playerByName('animalclinic')

                // This can be in either order, and idk how best to check so I just do both asserts and hope one works
                try {
                    assert.deepStrictEqual(r, {count: 2, players: [testPlayerProfile, animalclinicProfile]})
                } catch (err) {
                    assert.deepStrictEqual(r, {count: 2, players: [animalclinicProfile, testPlayerProfile]})
                }

            })

        })

        describe('playerByUUID()', function () {

            it('error on null/ undefined uuid')

            it('error on invalid uuid')

            it('finds no player', async function () {

                let r = await database.playerByUUID(nonePlayerUUID)

                assert.deepStrictEqual(r, {})

            })

            it('finds single player', async function () {

                let r = await database.playerByUUID(almicUUID)

                assert.deepStrictEqual(r, almicProfile)

            })

        })

        describe('playerConnectionSet()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('error on bad expire time')

            it('error on bad token length/ format')

            it('error on bad content length/ format')

            it('set content to value')

            it('set token to value, delete token (using null)')

            it('set hash with non-null value (value must be non-null but is ignored)')

        })

        describe('playerConnectionGet()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('finds no player')

            it('gets player connections')

            it('gets player connection content (default)')

            it('returns min ttl for null connection values')

        })

        describe('playerConnectionFind()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('finds no player')

            it('finds single player')

        })

        describe('playerDataSet()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('updates no player')

            it('sets integer data')

            it('sets string data')

            it('deletes data')

        })

        describe('playerDataGet()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('finds no player')

            it('returns no value')

            it('gets string value')

            it('gets integer value')

        })

        describe('playerIgnoreSet()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('finds no player')

            it('adds ignore (default)')

            it('removes ignore')

        })

        describe('playerIgnoreGet()', function () {

            it('error on null/ undefined uuid')

            it('error on invalid uuid')

            it('finds no player')

            it('gets empty ignore list')

            it('gets populated ignore list')

        })

        describe('playerLogout()', function () {

            it('error on null/ undefined uuid')

            it('error on invalid uuid')

            it('finds no player', async function () {

                let r = await database.playerLogout(nonePlayerUUID)

                assert.deepStrictEqual(r, {})

            })

            it('logout player', async function () {

                // Need to logout almic and test player

                let r = await database.playerLogout(almicUUID)

                let time = r.time // copy time

                assert.deepStrictEqual(r, {time})

                r = await database.playerLogout(testPlayerUUID)

                time = r.time

                assert.deepStrictEqual(r, {time})

            })

        })

        describe('playerNameStyleSet()', function () {

            it('error on null/ undefined uuid')

            it('error on invalid parameters')

            it('error on malicious input')

            it('error on malformed properties')

            it('finds no player', async function () {

                let r = await database.playerNameStyleSet(nonePlayerUUID, {mColor: 'a', underline: true})

                assert.deepStrictEqual(r, {})

            })

            it('sets name style', async function () {

                let r = await database.playerNameStyleSet(animalclinicUUID, {
                    mColor: 'a',
                    color: '123456',
                    bold: true
                })

                assert.deepStrictEqual(r, {success: 1})

                // retrieve and test name style was set correctly

                r = await database.playerByUUID(animalclinicUUID)

                assert.deepStrictEqual(r.nameStyle, {color: '123456', bold: true})

            })

            it('overwrites name style', async function () {

                let r = await database.playerNameStyleSet(animalclinicUUID, {
                    mColor: 'c',
                    underline: true
                })

                assert.deepStrictEqual(r, {success: 1})

                // retrieve and test name style was set correctly

                r = await database.playerByUUID(animalclinicUUID)

                assert.deepStrictEqual(r.nameStyle, {mColor: 'c', underline: true})

            })

            it('resets name style', async function () {

                let r = await database.playerNameStyleSet(animalclinicUUID, {}) // null should also work, this just triggers more code to run

                assert.deepStrictEqual(r, {success: 1})

                // retrieve and test name style was reset

                r = await database.playerByUUID(animalclinicUUID)

                assert.deepStrictEqual(r.nameStyle, {})

            })

            it('resets on effectively white styles', async function () {

                let r = await database.playerNameStyleSet(animalclinicUUID, {
                    mColor: 'c', // this is here to ensure color value takes priority
                    color: 'ffffff',
                    colorB: 'ffffff', // both set to white, covers more code
                    bold: false,
                    underline: undefined // specifically define as undefined, should effectively be the same as marking false
                })

                assert.deepStrictEqual(r, {success: 1})

                // retrieve and test namestyle was reset

                r = await database.playerByUUID(animalclinicUUID)

                assert.deepStrictEqual(r.nameStyle, {})

            })

        })

        describe('playerStatsUpdate()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input (delta is min/ maxed)')

            it('updates single stat')

            it('updates multiple stats')

            it('min/ max excessive stats')

            it('creates new stats for player')

        })

        describe('playerStatsGet()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('finds no player')

            it('gets single stat')

            it('gets multiple stats')

            it('gets empty stats (valid stat key, but not set on player)')

            it('gets server stats')

        })

        describe('playerWalletUpdate()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input (delta is min/ maxed)')

            it('finds no player')

            it('adds to wallet')

            it('adds to multiple wallets')

            it('min/ max excessive addition')

            it('subtract from wallets')

            it('handles negative balance')

            it('does partial rollback with failIfPartial=false')

            it('does full rollback with failIfPartial=true')

        })

        describe('playerWalletGet()', function () {

            it('error on null/ undefined parameters')

            it('error on invalid parameters')

            it('error on malicious input')

            it('finds no player')

            it('gets single wallet')

            it('gets multiple wallets')

            it('gets empty wallets (valid wallet, but not set on player)')

        })

    })


    after(async function () {

        process.stdout.write('\n  \x1b[36m') // next line, color, and indent
        await database.shutdown()
        process.stdout.write('\x1b[39m\x1b[1F\x1b[29G') // move to end of above output

        dbClient = new MongoClient(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@master-waua9.mongodb.net/?retryWrites=true`,
            {
                serverApi: {
                    version: ServerApiVersion.v1,
                    strict: true,
                    deprecationErrors: true
                }
            }
        )

        try {

            await dbClient.connect()
            dbMinecraft = dbClient.db("minecraft")

            // Remove testing player
            if (dbMinecraft) {
                let doc = await dbMinecraft.collection('details').deleteOne({uuid: testPlayerUUIDBin})
                if (doc.deletedCount != 1)
                    throw new Error(`Failed to delete test player, ${doc.deletedCount} documents removed`)
            }

        } finally {
            if (dbClient)
                await dbClient.close()
        }

    })

})
