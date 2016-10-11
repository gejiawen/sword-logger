/**
 * @file: logger
 * @author: gejiawen
 * @date: 9/26/16 11:18
 * @description: logger
 */

var fs = require('fs')
var path = require('path')
var util = require('util')
var querystring = require('querystring')
var bunyan = require('bunyan')
var uuid = require('uuid')
var onFinished = require('on-finished')
var _ = require('lodash')

var VERSION = '1.0.0'

var instance

var default_options = {
    logFolder: './logs',
    logFilePrefix: 'sword-logger',
    logFileSuffix: '.log',
    logRecordName: 'sword-logger-' + getCurrentDateString(),
    enableLogSrc: false,
    enableSaveInterval: false,
    logSaveInterval: 6e4,
    enableSaveBuffer: false,
    logSaveBuffer: 100,
    enableReqTimeoutLimit: false,
    reqTimeoutLimit: 1e3,
    enableRequestDetail: true,
    enableResponseDetail: true,
    enableTemplateDetail: true
}

function Logger(opts) {
    this.version = VERSION
    this.config = parseConfOptions(opts)
    this.section = getCurrentDateString()
    this.cacheSeq = []

    this.bunyan = bunyan.createLogger({
        name: this.config.logRecordName,
        src: this.config.enableLogSrc,
        streams: [
            {
                type: 'file',
                path: detectLogFilePath(this.config)
            }
        ],
        serializers: {
            request: reqSerializer,
            response: resSerializer,
            template: tmpSerializer,
            postData: postDataSerializer,
            err: bunyan.stdSerializers.err
        }
    })
}

function parseConfOptions(opts) {
    return _.extend(default_options, opts || {})
}

function getCurrentDateString() {
    return new Date().toLocaleDateString().replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2')
}

function detectLogFilePath(config) {
    var folderPath = path.resolve(config.logFolder)
    var exist = fs.existsSync(folderPath)

    if (!exist) {
        try {
            fs.mkdirSync(folderPath)
        } catch (ex) {
            throw new Error('make log folder failed: ', ex)
        }
    }

    var fileName = config.logFilePrefix + '-' + getCurrentDateString() + config.logFileSuffix
    return path.resolve(folderPath, fileName)
}

function reqSerializer(ctx) {
    return {
        method: ctx.method,
        url: ctx.url,
        headers: ctx.headers
    }
}

function resSerializer(ctx) {
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

function tmpSerializer(ctx) {
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

function cacheRecord(record) {
    if (instance.config.enableSaveInterval) {
        // TODO
    } else if (instance.config.enableSaveBuffer) {
        // TODO
    } else {
        saveRecord(record)
    }
}

function migrateLogFilePath() {
    if (instance.section !== getCurrentDateString()) {
        instance = new Logger(instance.config)
    }
}

function saveRecord(record) {
    // here is ugly
    // 检测每次写日志时，是否本地时间跨天，若跨天则会将改变logger instance的输出文件地址
    migrateLogFilePath()

    var level = record.level
    var category = record.category
    var field = record.field
    var value = record.value
    var msg = record.msg

    var fields = {}
    fields.category = category

    if (_.includes(['request', 'response', 'template'], category)) {
        fields[field] = value

        switch (category) {
            case 'request':
                requestSerializeSave(fields)
                break
            case 'response':
                responseSerializeSave(fields)
                break
            case 'template':
                templateSerializeSave(fields)
                break
        }
    } else {
        instance.bunyan[level](fields, msg)
    }
}

function templateSerializeSave(fields) {
    var ctx = fields.template
    var startTime = new Date().getTime()
    var level
    var duration
    ctx.req.reqId = uuid.v4()
    var fmtReqMsg = function () {
        return util.format('%s %s', ctx.req.method, ctx.req.headers.host + ctx.req.url)
    }
    var fmtResMsg = function () {
        return util.format('%s %s %d %sms', ctx.req.method, ctx.req.headers.host + ctx.req.url, ctx.status, duration)
    }
    var onResFinished = function () {
        duration = new Date().getTime() - startTime
        level = parseLevel(ctx.status, duration)
        fields.label = 'finished'
        fields.status = ctx.status
        fields.duration = duration
        fields.reqId = ctx.req.reqId
        fields.method = ctx.req.method
        instance.bunyan[level](fields, fmtResMsg())
    }

    !instance.config.enableTemplateDetail && delete fields.template
    if (ctx.req.method.toLowerCase() === 'post') {
        fields.postData = ctx.request.body || 'need use `bodyparser` middleware firstly' // here need app.use(bodyparser()) firstly.
    }

    fields.label = 'start'
    fields.reqId = ctx.req.reqId
    fields.method = ctx.req.method

    instance.bunyan.info(fields, fmtReqMsg())
    onFinished(ctx.response.res, onResFinished)
}

function requestSerializeSave(fields) {
    var ctx = fields.request
    var headers = ctx.headers
    var fmtReqMsg = function () {
        return util.format('%s %s', ctx.method, ctx.url)
    }

    fields = _.extend(fields, {
        label: 'start',
        reqId: headers['x-req-id'],
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

function responseSerializeSave(fields) {
    var ctx = fields.response
    var headers = ctx.headers
    var bump = ctx.bump
    var duration = headers['x-finish-time'] - headers['x-start-time']
    var level = parseLevel(bump.status, duration)
    var fmtResMsg = function () {
        return util.format('%s %s %s %s %dms', ctx.method, ctx.url, bump.status, bump.statusText, duration)
    }

    fields = _.extend(fields, {
        label: 'finish',
        reqId: headers['x-req-id'],
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

function parseLevel(status, duration) {
    if (status >= 400 || status === 'TIMEOUT') {
        return 'error'
    } else {
        if (instance.config.enableReqTimeoutLimit && duration > instance.config.reqTimeoutLimit) {
            return 'warn'
        }
        return 'info'
    }
}

function saveInterval() {
    // TODO
}

function saveBuffer() {
    // TODO
}

function clearCacheSeq() {
    // TODO
}

function wrapper(category) {
    switch (category) {
        case 'fatal':
        case 'error':
        case 'warn':
        case 'info':
        case 'debug':
        case 'trace':
            return function (msg) {
                cacheRecord({
                    category: category,
                    level: category,
                    msg: msg
                })
            }
            break
        case 'template':
        case 'request':
        case 'response':
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
Logger.prototype.template = wrapper('template')
Logger.prototype.request = wrapper('request')
Logger.prototype.response = wrapper('response')

module.exports = function (opts) {
    instance = new Logger(opts)

    return function *(next) {
        this.logger = instance
        this.logger.template(this)

        yield next
    }
}
