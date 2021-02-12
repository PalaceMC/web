if (process.env.NODE_ENV !== 'production') {
    // Development environment
    require('dotenv').config()
}

const express = require('express')
const app = express()
const { createProxyMiddleware } = require('http-proxy-middleware')
//const path = require('path')
const PORT = process.env.PORT || 8080
const CREATIVEIP = process.env.CREATIVEIP
const CREATIVEPORT = process.env.CREATIVEPORT
const SURVIVALIP = process.env.SURVIVALIP
const SURVIVALPORT = process.env.SURVIVALPORT

// configure static resources (stylesheets, images, etc.)
//app.use(express.static(path.join(__dirname, 'static')))
app.use(express.static('static'))

// configure rendering engine
//app.set('views', path.join(__dirname, 'views'))
app.set('views', 'views')
app.set('view engine', 'ejs')

// internal routing
app.get('/', (req, res) => res.render('index'))

// proxy work (dynmap stuff)
app.get('^/map/hub$', (req, res) => res.redirect('/map/hub/'))
app.use('/map/hub/', createProxyMiddleware({
    target: `http://${CREATIVEIP}:${CREATIVEPORT}`,
    pathRewrite: {'^/map/hub/':''}
}))

app.get('^/map/survival$', (req, res) => res.redirect('/map/survival/'))
app.use('/map/survival/', createProxyMiddleware({
    target: `http://${SURVIVALIP}:${SURVIVALPORT}`,
    pathRewrite: {'^/map/survival/':''}
}))

const server = app.listen(process.env.PORT || 8080, () => {
    console.log(`Listening on port ${server.address().port}`)
})
