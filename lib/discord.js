
// discord

// request (promisify)
const util = require('util')
const request = require('request')

const database = require('./database')
const INSTANT_SECOND_MAX = 31556889864403199n
const INSTANT_SECOND_MIN = -31557014167219200n

/**
 * Error result
 * @typedef {object} ErrorResult
 * @property {1} error
 * @property {string} message
 */
/**
 * Standard error object generator
 *
 * @param {string} message
 * @returns {ErrorResult} {@link ErrorResult}
 */
function error(message) {
    return {error: 1, message: (typeof message == 'string' ? message : message?.at(0) ?? 'Error')}
}

/**
 * Check if `value` is null-ish.
 *
 * Identical to `(value === null || value === undefined)`
 *
 * @param {*} value
 * @returns {boolean} true if value is null-ish
 */
function isNull(value) {
    return (value === null || value === undefined)
}

/**
 * Check if `string` is a non-empty string.
 *
 * Identical to `(string && typeof string == 'string')`
 *
 * @param {*} string
 * @returns {boolean} if `string` is a non-empty string
 */
function validateString(string) {
    return (string && typeof string == 'string')
}

const DISCORD_CLIENTID = process.env.DISCORD_CLIENTID
const DISCORD_SECRET = process.env.DISCORD_SECRET
const DISCORD_URL = "https://discord.gg/4mzWHGE"
const DISCORD_AUTH = "https://discord.com/api/oauth2/authorize?client_id=782453797007786024&redirect_uri=https%3A%2F%2Fpalacemc.net%2Fdiscord&response_type=code&scope=identify"

function code(text) { return `<code class="inline-box">${text}</code>` }
const tryAgainMessage = `<br/>You can go back onto the Minecraft server and try running ${code`/discord verify`} to get a new verification link.` +
`<br/>If you keep seeing this error, contact staff on the server for help.`
const badOrExpiredMessage = `The provided state is malformed or expired.${tryAgainMessage}`
const discordFailMessage = `Either discord isn't playing nice, or this link has expired.${tryAgainMessage}`

/**
 * Discord verification for /discord
 * @type {import('express').RequestHandler}
 */
async function discord(req, res) {

    if (!req.query.state || typeof req.query.state !== 'string'
    ) {
        return res.redirect(DISCORD_URL)
    }

    let state = req.query.state.split(';', 2)
    if (state.length != 2)
        return res.redirect(DISCORD_URL)

    let uuid = state[0]
    let hash = state[1]

    if (!req.query.code || typeof req.query.code !== 'string') {
        return res.redirect(DISCORD_AUTH + `&state=${uuid.toString()};${hash}`)
    }

    let code = req.query.code

    // We are back from the Discord Auth and have a code

    // Make sure connection is not already set
    let connection = await database.playerConnectionGet(uuid, 'discord', 'content')
    if (connection.error) {
        // Assume UUID is wrong
        return res.render('discord', { success: false, message: badOrExpiredMessage })
    }

    // Connection must have "unset" properties
    if (connection.ttl != INSTANT_SECOND_MIN || connection.value != null) {
        // Connection already set
        res.render("discord", {
            success: false,
            message:
`Your account has already been linked.<br/>If you need to connect a new account, please unlink first.<br/>You can go back onto the Minecraft` +
` server and run ${code`/discord unlink`}, then ${code`/discord verify`} to get a new verification link.`
        })
    }

    // Check hash now
    connection = await database.playerConnectionGet(uuid, 'discord', 'hash')
    if (connection.error) {
        // Assume UUID is wrong (but how?)
        return res.render('discord', { success: false, message: badOrExpiredMessage })
    }

    // Check hash + ttl
    if (connection.value == null || connection.ttl == INSTANT_SECOND_MIN || connection.ttl < Math.round(req.requestTime / 1000)
            || connection.value !== hash
    ) {
        // Expired/ incorrect
        return res.render('discord', { success: false, message: badOrExpiredMessage })
    }

    // Hash is good, get the snowflake from Discord
    let discordResponse = JSON.parse((await util.promisify(request.post)({
        url: 'https://discord.com/api/v8/oauth2/token',
        form: {
            'client_id': DISCORD_CLIENTID,
            'client_secret': DISCORD_SECRET,
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': 'https://palacemc.net/discord'
        }
    })).toJSON().body)

    if (discordResponse.error != null) {
        req.log(`discord: ${discordResponse.error} ${discordResponse.error_description}`)
        return res.render('discord', { success: false, message: discordFailMessage })
    }

    // Make sure we have what we need
    let fail = false

    if (!discordResponse.access_token) {
        req.log('discord: missing access_token')
        fail = true
    }

    if (!discordResponse.refresh_token) {
        req.log('discord: missing refresh_token')
        fail = true
    }

    if (!discordResponse.expires_in) {
        req.log('discord: missing expires_in')
        fail = true
    }

    if (fail) {
        return res.render('discord', { success: false, message: discordFailMessage })
    }

    let access_token = discordResponse.access_token,
        refresh_token = discordResponse.refresh_token,
        expires_in = discordResponse.expires_in

    // now we get the id, because for some reason discord makes us perform two requests
    discordResponse = JSON.parse((await util.promisify(request.get)({
        url: 'https://discordapp.com/api/users/@me',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    })).toJSON().body)

    if (!!discordResponse.message) {
        console.log(`discord: ${discordResponse.message}`)
        return res.render("discord", { success: false, message: discordFailMessage })
    }

    if (!discordResponse.id) {
        console.log("discord: missing id")
        res.render("discord", { success: false, message: discordFailMessage })
        return
    }

    let id = discordResponse.id

    // after fucking ALL of this, we have to make sure the ID isn't used already
    let player = await database.playerConnectionFind('discord', id)
    if (player.error) {
        // well shit
        req.log(`discord: playerConnectionFind('discord', '${id}'); ${player.message}`)
        return res.render('discord', {
            success: false,
            message: `There's been an unfortunate internal error during verification, please report this error code immediately:<br/>${code`FIND`}`
        })
    }

    if (player.uuid) {
        // Already being used
        return res.render('discord', {
            success: false,
            message: `That Discord account is already linked to a different Minecraft account.<br/>Please contact staff on the server for assistance.`
        })
    }

    // FINALLY save that shit to DB
    let result = await database.playerConnectionSet(uuid, 'discord', 'content', id, INSTANT_SECOND_MAX)
    if (!result.value) {
        if (result.error) {
            // well double shit
            req.log(`discord: playerConnectionSet('${uuid}', 'discord', 'content', '${id}', ${INSTANT_SECOND_MAX}); ${result.message}`)
            return res.render('discord', {
                success: false,
                message: `There's been an unfortunate internal error during verification, please report this error code immediately:<br/>${code`CONTENT`}`
            })
        }
        return res.render('discord', {
            success: false,
            message: `I'm gonna level with you here... an absolutely crazy-ass error (#1) just happened, and I'm actually a little scared. Help me.`
        })
    }

    // Connection is "done enough," go ahead and ship out the verification message so discord updates the account
    player = await database.playerByUUID(uuid)
    if (!player.name) {
        if (player.error) {
            // well triple shit
            req.log(`discord: playerByUUID('${uuid}'); ${player.message}`)
            return res.render('discord', {
                success: false,
                message: `There's been an unfortunate internal error during verification, please report this error code immediately:<br/>${code`USERNAME`}`
            })
        }
        return res.render('discord', {
            success: false,
            message: `Haha who are you and why am I?`
        })
    }

    result = await webhookSend('verify', null, null, player.name)
    if (!result.success) {
        let ecode = '?ME IDIOT?'
        if (result.error) {
            // quadruple shit
            req.log(`discord: webhookSend('verify', null, null, '${player.name}'); ${result.message}`)
            ecode = 'WEBHOOK'
        }
        return res.render('discord', {
            success: false,
            message:
`There's been an unfortunate internal error during verification, however, it was somewhat successful and your account has been connected.` +
` Please join the discord server and type your username into the #verification channel to complete the process.` +
`<br/>But, please report this error code immediately:</br>${code(ecode)}`
        })
    }

    // Okay, clean up time. Set the tokens and delete the hash

    result = await database.playerConnectionSet(uuid, 'discord', 'token', `${access_token},${refresh_token}`, req.requestTime + expires_in)
    if (!result.value) {
        if (result.error) {
            // quintuple shit
            req.log(`discord: playerConnectionSet('${uuid}', 'discord', 'token', '${access_token},${refresh_token}', ${req.requestTime + expires_in}); ${result.message}`)
            return res.render('discord', {
                success: false,
                message:
`There's been an unfortunate internal error during verification, however, it was somewhat successful. Your account has been connected,` +
` and you should have access to the discord now.<br/>But, please report this error code immediately:<br/>${code`TOKEN`}`
            })
        }
        return res.render('discord', {
            success: false,
            message: `I'm gonna level with you here... an absolutely crazy-ass error (#2) just happened, everything should be fine, but I'm actually a little scared. Help me.`
        })
    }

    result = await database.playerConnectionSet(uuid, 'discord', 'hash', null)
    if (result.value !== null) {
        if (result.error) {
            // sextuple shit (hahaha "SEX"tuple hahAHHAH)
            req.log(`discord: playerConnectionSet('${uuid}', 'discord', 'hash', null); ${result.message}`)
            return res.render('discord', {
                success: false,
                message:
`There's been an unfortunate internal error during verification, however, it was somewhat successful. Your account has been connected,` +
` and you should have access to the discord now.<br/>But, please report this error code immediately:<br/>${code`THE HASH-SLINGING SLASHER`}`
            })
        }
        return res.render('discord', {
            success: false,
            message: `You've just been slashed by the Hash-Slinging Slasher. Go on, tell the staff on Discord, but they can't save you (they actually can I'm just joking).`
        })
    }

    return res.render('discord', {
        success: true,
        message:
`Your discord account has been linked!<br/>If you haven't already, <a href="${DISCORD_URL}" target="_blank">join the discord</a>. It might ` +
`take a few moments to get your Member role, so have patience.<br/>If it takes longer than five minutes, contact staff on the server for help.`
    })

}

/**
 * Execute webhooks of the given kind with the provided content.
 *
 * @public
 *
 * @param {string} kind - webhook kind to send message to
 * @param {string} name - name for the webhook user
 * @param {string} avatar - avatar url for the webhook user
 * @param {string} message - message content, only plain text is supported right now
 * @returns {Promise<import('./database').SuccessResult>} generic success, or an error
 */
async function webhookSend(kind, name, avatar, message) {

    if (isNull(kind))
        return error`String 'kind' is required`
    if (!validateString(kind))
        return error`Key 'kind' must be a non-empty string`
    if (kind !== 'verify' && kind !== 'chat' && kind !== 'moderation')
        return error`Key 'kind' must be one of "chat", "verify", or "moderation"`

    if (isNull(name))
        name = null // ensure null
    else if (!validateString(name))
        return error`Key 'name' must be a non-empty string or unset`
    else
        name = name.substring(0, 20) // limit to 20 characters

    if (isNull(avatar))
        avatar = null // ensure null
    else if (!validateString(avatar))
        return error`Key 'avatar' must be a non-empty string or unset`
    else if (avatar.length > 1000)
        return error`Key 'avatar' is too long, cannot be more than 1000 characters`

    if (isNull(message))
        return error`String 'message' is required`
    if (!validateString(message))
        return error`Key 'message' must be a non-empty string`
    message = message.substring(0, 2000) // discord hard-limit is 2000 characters

    let servers = await database.discordServersGet()
    if (servers.count == 0)
        return error`No servers exist, no where to send to`

    for (let server of servers.servers) {
        if (server.webhooks) {
            for (let webhook of server.webhooks) {
                if (kind.localeCompare(webhook.kind) == 0) {
                    // Send to webhook
                    form = {
                        content: message,
                        tts: false, // sneaky feckers ;)
                        allowed_mentions: { parse: [] }
                    }
                    if (name != null)
                        form.username = name
                    if (avatar != null)
                        form.avatar_url = avatar

                    // todo: investigate using `?wait=true` to verify that webhooks are sending, otherwise logging or returning an error
                    await util.promisify(request.post)({ url: `https://discord.com/api/v10/webhooks/${webhook.id}/${webhook.token}`, form })
                }
            }
        }
    }

    return {success: 1}
}

module.exports = {
    discord,
    webhookSend,
}
