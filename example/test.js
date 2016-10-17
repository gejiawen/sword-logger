var koa = require('koa')
var bodyparser = require('koa-bodyparser')
var logger = require('../lib/logger')({
    logFolder: './logs',
    logFilePrefix: 'cluster',
    enableActionLogger: false,
    logSlice: false,
    middlewareModel: false
})

var app = koa()

app.use(bodyparser())
// app.use(logger({
//     logFolder: './logs'
// }))

app.use(function *(next) {
    var url = this.url.replace(/^(\/\w*)\?.+/, '$1')
    if (url === '/') {
        this.body = 'home page'
        logger.info('homepage')
    }
    if (url === '/user') {
        this.body = 'user page'
        this.logger.error('error ui page')
    }

    if (url === '/goods') {
        this.body = 'goods page'
    }
})

app.listen(8000)
