if (process.env.NODE_ENV !== 'production') {
    // Development environment
    require('dotenv').config()
}

const PORT = process.env.PORT || 8080
const CREATIVEIP = process.env.CREATIVEIP
const CREATIVEPORT = process.env.CREATIVEPORT
const SURVIVALIP = process.env.SURVIVALIP
const SURVIVALPORT = process.env.SURVIVALPORT

// discord

// request (promisify)
const util = require('util')
const request = require('request')

// express app setup
const express = require('express')
const app = express()
const { createProxyMiddleware } = require('http-proxy-middleware')

const { apiRouter } = require('./lib/api')
const discord = require('./lib/discord')
const database = require('./lib/database')

async function main() {

    // Request time and ip logger
    app.use((req, res, next) => {
        req.requestTime = Date.now()

        // Get remote address and validate
        let ip = req.socket.remoteAddress
        let port = req.socket.remotePort

        if (typeof ip != 'string' || ip.length < 7) {
            ip = JSON.stringify(ip)
            return doError(res, 500, `Unable to read remote IP address. You are [ '${ip}' ]`)
        }

        if (typeof port != 'number') {
            port = JSON.stringify(port)
            return doError(res, 500, `Unable to read remote port. You are [ ${ip}:${port} ]`)
        }

        req.remoteAddress = ip
        req.remotePort = port
        req.remoteExpanded = `${ip}:${port}`

        // Get local address
        req.domain = req.hostname
        req.port = req.socket.localPort

        console.log(`[${req.remoteExpanded}] ${req.method} ${req.protocol}://${req.domain}:${req.port}${req.originalUrl}`)

        next()
    })

    // configure static resources (stylesheets, images, etc.)
    //app.use(express.static(path.join(__dirname, 'static')))
    app.use(express.static('static'))

    // Use apiRouter for the "api" subdomain
    app.use((req, res, next) => {
        if (req.subdomains.length > 0 && req.subdomains[0] == 'api') {
            return apiRouter(req, res, next)
        }
        next()
    })

    // strip trailing slashes (they fuck up resource loading)
    app.use((req, res, next) => {
        if (req.path.substring(0,4) != '/map' && req.path.slice(-1) == '/' && req.path.length > 1) {
            let query = req.url.slice(req.path.length)
            res.redirect(301, req.path.slice(0, -1) + query)
        } else {
            next()
	    }
	})

    // configure rendering engine
    //app.set('views', path.join(__dirname, 'views'))
    app.set('views', 'views')
    app.set('view engine', 'ejs')

    // internal routing
    app.get('/', (req, res) => res.render('index'))
    app.get('/help/?', (req, res) => res.render('help'))
    app.get('/jobs/?', (req, res) => res.render('jobs'))
    app.get('/shop/?', (req, res) => res.render('shop'))

    // proxy work (dynmap stuff)
    app.get('^/map/hub$', (req, res) => res.redirect('/map/hub/'))
    app.use('/map/hub/', createProxyMiddleware({
        target: `http://${CREATIVEIP}:${CREATIVEPORT}`,
        pathRewrite: { '^/map/hub/': '' }
    }))

    app.get('^/map/survival$', (req, res) => res.redirect('/map/survival/'))
    app.use('/map/survival/', createProxyMiddleware({
        target: `http://${SURVIVALIP}:${SURVIVALPORT}`,
        pathRewrite: { '^/map/survival/': '' }
    }))

    // Discord account verification
    // final url match catches anything else
    app.get('/discord', discord)

    // 404 Not Found response
    app.use((req, res, next) => {
        if (!res.headersSent)
            res.status(404).render("error", {
                errorTitle: "404 Not Found",
                errorHeader: "404",
                errorMessage: "The page you requested doesn't exist. That's all I know.",
                errorContent: false
            })
    })

    // 500 Server Error response
    app.use((err, req, res, next) => {
        console.error(err.stack)
        if (!res.headersSent)
            res.status(500).render("error", {
                errorTitle: "500 Internal Server Error",
                errorHeader: "Woah!",
                errorMessage: "Yep, you broke it. Good job. (500 Internal Server Error)",
                errorContent: false
            })
    })

    const server = app.listen(PORT, () => {
        console.log(`Listening on port ${server.address().port}`)
    })

    process.on('SIGTERM', () => {
        console.log('Received shutdown signal, closing server')
        server.close(() => { console.log("HTTP server closed")})
        database.shutdown()
    })

    return 'Started'

}

main()
    .then(console.log)
    .catch(console.error)
