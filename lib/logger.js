/**
 * @file: logger
 * @author: gejiawen
 * @date: 9/26/16 11:18
 * @description: logger
 */

var fs = require('fs')
var path = require('path')
var util = require('util')
var bunyan = require('bunyan')
var uuid = require('uuid')
var onFinished = require('on-finished')
var _ = require('lodash')

// 上一个版本是1.2.0
// 但是因为要临时上一个自定义落地日志的需求，但是因为一些历史原因，之前一直在使用1.0.0版本，所以此次更新为1.0.1
var VERSION = '1.0.1'

var instance
var b

var default_options = {
    logFolder: './logs',
    logFilePrefix: 'sword-logger',
    logFileSuffix: '.log',
    logRecordName: 'sword-logger-yyyy-m-dd',
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
                path: detectLogFilePath(this.config),
                level: 'trace'
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
        hostname: ctx.hostname ? ctx.hostname : '',
        path: ctx.path,
        headers: ctx._headers
    }
}

function resSerializer(ctx) {
    var ret
    try {
        ret = JSON.parse(ctx.result)
        return JSON.stringify(ret)
    } catch (e) {
        return e
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
    return ctx
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

                // 禁用了response日志类型的详情记录，此时可能为生产环境。
                // 针对生产环境，
                if (!instance.config.enableResponseDetail) {
                    instance.fn(b) && instance.bunyan.debug(b)
                }
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

    fields.label = 'start'
    fields.reqId = ctx.req.reqId
    fields.method = ctx.req.method

    !instance.config.enableTemplateDetail && delete fields.template
    if (ctx.req.method.toLowerCase() === 'post') {
        fields.postData = ctx.request.body || 'need use `bodyparser` middleware firstly' // here need app.use(bodyparser()) firstly.
    }

    instance.bunyan.info(fields, fmtReqMsg())
    onFinished(ctx.response.res, onResFinished)
}

function requestSerializeSave(fields) {
    var ctx = fields.request
    var startTime = new Date().getTime()
    var fmtReqMsg = function () {
        return util.format('%s %s', ctx.method, ctx.agent.protocol + '//' + (ctx.hostname ? ctx.hostname : ctx._headers.host) + ctx.path)
    }

    ctx.startTime = startTime
    ctx.reqId = uuid.v4()

    fields.label = 'start'
    fields.reqId = ctx.reqId
    fields.method = ctx.method

    !instance.config.enableRequestDetail && delete fields.request
    if (ctx.method.toLowerCase() === 'post') {
        fields.postData = ctx.postData // this `postData` is involved in connector middleware
    }

    instance.bunyan.info(fields, fmtReqMsg())
}

function responseSerializeSave(fields) {
    var ctx = fields.response
    b = ctx.result
    var req = ctx.req
    var duration = new Date().getTime() - req.startTime
    var level = parseLevel(ctx.statusCode, duration)
    var fmtResMsg = function () {
        return util.format('%s %s %s %dms', req.method, req.agent.protocol + '//' + (req.hostname ? req.hostname : req._headers.host) + req.path, ctx.statusCode, duration)
    }

    fields.label = 'finished'
    fields.status = ctx.status
    fields.duration = duration
    fields.reqId = ctx.req.reqId
    fields.method = req.method

    !instance.config.enableResponseDetail && delete fields.response
    if (req.method.toLowerCase() === 'post') {
        fields.postData = req.postData
    }

    instance.bunyan[level](fields, fmtResMsg())
}

function parseLevel(status, duration) {
    if (status >= 500) {
        return 'error'
    } else if (status >= 400) {
        return 'warn'
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
