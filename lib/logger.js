/**
 * @file: logger
 * @author: gejiawen
 * @date: 9/26/16 11:18
 * @description: logger
 *
 * sword-logger中间件将所有的日志分为如下几大类（category），
 *
 * fatal、error、warn、info、trace、debug
 * request、response、render、action
 *
 * 其中第一行的6种其实是bunyan自带日志等级的alias，
 * 第二行是根据不同业务场景抽象出来的。
 *
 * - request，Nodejs程序向rest服务器发送rest api请求的日志
 * - response，rest服务器返回给Nodejs程序的rest api响应的日志
 * - render，服务端模板的渲染日志，这里所谓的渲染日志其实是跟客户端（浏览器）是没有关系的，它仅仅表示模板文件和数据的组装和编译过程
 * - action，所有由用户发起从而产生的交互日志，包括页面请求、表单提交、客户端ajax请求等等
 *
 * 每一条日志都是一个record抽象，每个record实例在category的维度下，还会有level的区分，
 * 常用record的level有如下几种
 * - info
 * - warn
 * - error
 *
 */

var fs = require('fs')
var path = require('path')
var util = require('util')
var querystring = require('querystring')
var bunyan = require('bunyan')
var uuid = require('uuid')
var onFinished = require('on-finished')
var _ = require('lodash')
var moment = require('moment')

var VERSION = '1.1.2'
var instance
var default_options = {
    logFolder: '',
    logFilePrefix: 'sword-logger',
    logFileSuffix: '.log',
    logRecordName: 'sword-logger-' + getCurrentDateString(),
    enableLogSrc: false,
    enableSaveInterval: false,
    logSaveInterval: 6e4,
    enableSaveBuffer: false,
    logSaveBuffer: 100,
    enableDurationLimit: true,
    durationLimit: 5e3,
    enableCache: true,
    enableRequestDetail: true,
    enableResponseDetail: true,
    enableActionLogger: true,
    enableActionDetail: true
}

var START = 'START'
var FINISH = 'FINISH'
var ERROR = 'ERROR'
var TIMEOUT = 'TIMEOUT'

function Logger(opts) {
    this.version = VERSION
    this.config = _.extend(default_options, opts || {})
    this.section = getCurrentDateString()

    // TODO
    // process this.config.enableCache
    // this.cache = []

    if (!this.config.logFolder) {
        throw new Error('logFolder is required')
    }

    this.bunyan = bunyan.createLogger({
        name: this.config.logRecordName,
        src: this.config.enableLogSrc,
        streams: [
            {
                type: 'file',
                path: detectLogFilePath.call(this)
            }
        ],
        serializers: {
            request: requestSerializer,
            response: responseSerializer,
            action: actionSerializer,
            postData: postDataSerializer,
            renderError: renderErrorSerializer,
            actionError: actionErrorSerializer,
            err: bunyan.stdSerializers.err
        }
    })
}

function getCurrentDateString() {
    return moment().format('YYYY-MM-DD HH:mmZZ').replace(/^(\d+)-(\d+)-(\d+) (.+)([+-]\d+)$/, '$1$2$3$5')
}

function detectLogFilePath() {
    var folderPath = path.resolve(this.config.logFolder)
    var exist = fs.existsSync(folderPath)

    if (!exist) {
        try {
            fs.mkdirSync(folderPath)
        } catch (ex) {
            throw new Error('make log folder failed: ' + ex.message)
        }
    }

    var fileName = this.config.logFilePrefix + '-' + this.section + this.config.logFileSuffix
    return path.resolve(folderPath, fileName)
}

function requestSerializer(ctx) {
    return {
        method: ctx.method,
        url: ctx.url,
        headers: ctx.headers
    }
}

function responseSerializer(ctx) {
    if (ctx.ex) {
        return ctx.bump.status + ' ' + ctx.bump.statusText
    } else {
        try {
            return JSON.stringify(ctx.bump.json)
        } catch (ex) {
            return ex
        }
    }
}

function actionSerializer(ctx) {
    var req = ctx.request.req
    var res = ctx.response.res

    if (!res.finished) {
        if (!req || !req.connection) {
            return req
        }
        return {
            method: req.method,
            url: req.url,
            headers: req.headers,
            remoteAddress: req.connection.remoteAddress,
            remotePort: req.connection.remotePort
        }
    } else {
        if (!res || !res.statusCode) {
            return res
        }
        return {
            statusCode: res.statusCode,
            header: res._header
        }
    }
}

function postDataSerializer(ctx) {
    return querystring.parse(ctx)
}

function renderErrorSerializer(ctx) {
    return {
        path: ctx.path,
        message: ctx.message
    }
}

function actionErrorSerializer(ctx) {
    // TODO
}

function cacheRecord(record) {
    if (instance.config.enableSaveInterval) {
        // TODO
    } else if (instance.config.enableSaveBuffer) {
        // TODO
    } else {
        saveRecord(record)
    }
}

function saveInterval() {
    // TODO
}

function saveBuffer() {
    // TODO
}

function cleanCache() {
    this.cache = []
}

function saveRecord(record) {
    // TODO here is ugly, need refine
    // 检测每次写日志时，是否本地时间跨天，若跨天则会将改变logger instance的输出文件地址
    // TODO 当启用缓存写日志时，一旦检测到前后的日志记录跨天，那么应该立马将现有的cache写入日志
    if (instance.section !== getCurrentDateString()) {
        instance = new Logger(instance.config)
    }

    var level = record.level
    var category = record.category
    var field = record.field
    var value = record.value
    var message = record.message
    var fields = {}

    fields.category = category

    if (_.includes(['request', 'response', 'render', 'action'], category)) {
        fields[field] = value

        switch (category) {
            case 'request':
                saveRequestRecords(fields)
                break
            case 'response':
                saveResponseRecords(fields)
                break
            case 'render':
                saveRenderRecords(fields)
                break;
            case 'action':
                saveActionRecords(fields)
        }
    } else {
        instance.bunyan[level](fields, message)
    }
}

function saveRequestRecords(fields) {
    var ctx = fields['request']
    var headers = ctx.headers
    var fmtReqMsg = function () {
        return util.format('%s %s', ctx.method, ctx.url)
    }

    fields = _.extend(fields, {
        label: START,
        loggerId: headers['x-logger-id'],
        method: ctx.method
        // url: ctx.url
    })

    if (ctx.method.toUpperCase() === 'POST') {
        fields.postData = ctx.body
    }
    if (!instance.config.enableRequestDetail) {
        delete fields.request
    }

    instance.bunyan.info(fields, fmtReqMsg())
}

function saveResponseRecords(fields) {
    var ctx = fields['response']
    var headers = ctx.headers
    var bump = ctx.bump
    var duration = headers['x-finish-time'] - headers['x-start-time']
    var level = parseLevel(bump.status, duration)
    var fmtResMsg = function () {
        return util.format('%s %s %s %s %dms', ctx.method, ctx.url, bump.status, bump.statusText, duration)
    }

    fields = _.extend(fields, {
        label: FINISH,
        loggerId: headers['x-logger-id'],
        method: ctx.method,
        duration: duration,
        // url: ctx.url,
        // status: bump.status,
        // statusText: bump.statusText
    })

    // if (ctx.method.toUpperCase() === 'POST') {
    //     fields.postData = ctx.body
    // }
    if (!instance.config.enableResponseDetail) {
        delete fields.response
    }

    instance.bunyan[level](fields, fmtResMsg())
}

function saveRenderRecords(fields) {
    var ctx = fields['render']
    var loggerId = ctx.loggerId
    var type = ctx.type
    var route = ctx.route
    var ex = ctx.ex
    var level = parseLevel(type)
    var fmtRenderMsg = function () {
        if (type === START) {
            return util.format('RENDER %s %s', obj.route, type)
        } else {
            return util.format('RENDER %s %s %dms', obj.route, type, ctx.finish - ctx.start)
        }
    }

    var obj = {
        label: type === START ? START : FINISH,
        loggerId: loggerId,
        route: /^\/\.+/.test(route) ? route : '/' + route // `activity/index` => `/activity/index`
    }

    if (type !== START) {
        obj.duration = ctx.finish - ctx.start
    }

    if (type === ERROR) {
        obj.renderError = ex
    }

    instance.bunyan[level](obj, fmtRenderMsg())
}

function saveActionRecords(fields) {
    var ctx = fields['action']
    var startTime = new Date().getTime()
    var level
    var duration
    ctx.req.loggerId = uuid.v4()
    var fmtReqMsg = function () {
        return util.format('%s %s', ctx.req.method, ctx.req.headers.host + ctx.req.url)
    }
    var fmtResMsg = function () {
        return util.format('%s %s %d %dms', ctx.req.method, ctx.req.headers.host + ctx.req.url, ctx.status, duration)
    }
    var onResFinished = function () {
        duration = new Date().getTime() - startTime
        level = parseLevel(ctx.status, duration)
        fields.label = FINISH
        fields.status = ctx.status
        fields.duration = duration
        fields.loggerId = ctx.req.loggerId
        fields.method = ctx.req.method
        instance.bunyan[level](fields, fmtResMsg())
    }

    !instance.config.enableActionDetail && delete fields.action
    if (ctx.req.method.toUpperCase() === 'POST') {
        fields.postData = ctx.request.body || 'need use `bodyparser` middleware before sword-logger' // here need app.use(bodyparser()) firstly.
    }

    fields.label = START
    fields.loggerId = ctx.req.loggerId
    fields.method = ctx.req.method

    instance.bunyan.info(fields, fmtReqMsg())
    onFinished(ctx.response.res, onResFinished)
}

function parseLevel(status, duration) {
    if (status >= 400) {
        return 'error'
    } else if (typeof status === 'string' && _.includes(['TIMEOUT', 'ERROR'], status)) {
        return 'error'
    } else {
        if (instance.config.enableDurationLimit && duration > instance.config.durationLimit) {
            return 'warn'
        }
        return 'info'
    }
}

function wrapper(category) {
    switch (category) {
        case 'fatal':
        case 'error':
        case 'warn':
        case 'info':
        case 'debug':
        case 'trace':
            return function (message) {
                cacheRecord({
                    category: category,
                    level: category,
                    message: message
                })
            }
            break
        case 'template':
        case 'request':
        case 'response':
        case 'render':
        case 'action':
            return function (field) {
                cacheRecord({
                    category: category,
                    field: category,
                    value: field
                })
            }
            break
    }
}

Logger.prototype.fatal = wrapper('fatal')
Logger.prototype.error = wrapper('error')
Logger.prototype.warn = wrapper('warn')
Logger.prototype.info = wrapper('info')
Logger.prototype.debug = wrapper('debug')
Logger.prototype.trace = wrapper('trace')
Logger.prototype.request = wrapper('request')
Logger.prototype.response = wrapper('response')
Logger.prototype.render = wrapper('render')
Logger.prototype.action = wrapper('action')

module.exports = function (opts) {
    instance = new Logger(opts)

    return function *(next) {
        this.logger = instance
        this.logger.koa = this

        // 是否监控页面交互日志
        // 所谓页面交互日志，即为所有由用户发起从而产生的日志，
        // 比如，请求页面、提交表单、客户端ajax请求等
        this.logger.config.enableActionLogger && this.logger.action(this)

        yield next
    }
}
