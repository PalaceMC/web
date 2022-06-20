
if (process.env.NODE_ENV !== 'production') {
    // Development environment
    require('dotenv').config()
}

const { UUID } = require('bson')
const { MongoClient, ServerApiVersion } = require('mongodb')

const database = require('../lib/database')

const testPlayerUUID = '5b084158-b400-4ba7-88fe-7b730f2627db'
const testPlayerUUIDBin = new UUID(testPlayerUUID).toBinary()


describe('Database', function () {

    before(async function () {

        process.stdout.write('  ') // indent connection message
        let r = await database.logSave('test')
        process.stdout.write('\x1b[1F') // move up one line, so no empty gap

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

        it('empty for player not found')

        it('mutes player for time')

        it('unmutes player (default)')

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

            it('login existing player')

            it('login new player')

            it('login and changes name')

        })

        describe('playerByName()', function () {

            it('error on null/ undefined name')

            it('error on invalid name')

            it('error on malicious input')

            it('finds no player')

            it('finds single player')

            it('finds multiple players')

        })

        describe('playerByUUID()', function () {

            it('error on null/ undefined uuid')

            it('error on invalid uuid')

            it('finds no player')

            it('finds single player')

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

            it('finds no player')

            it('logout player')

        })

        describe('playerNameStyleSet()', function () {

            it('error on null/ undefined uuid')

            it('error on invalid parameters')

            it('error on malicious input')

            it('error on malformed properties')

            it('finds no player')

            it('sets name style')

            it('overwrites name style')

            it('resets name style')

            it('resets on effectively white styles')

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

        process.stdout.write('\n  ') // next line and indent
        await database.shutdown()
        process.stdout.write('\x1b[1F\x1b[29G') // move to end of above output

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
