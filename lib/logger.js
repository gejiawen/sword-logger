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

var version = '1.0.1'

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
    enableRequestDetail: false,
    enableResponseDetail: true,
    enableTemplateDetail: false
}
var logger = null
var config = null
var cacheSeq = []

function parseConfOptions(opts) {
    return _.extend(default_options, opts || {})
}

function getCurrentDateString() {
    return new Date().toLocaleDateString().replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2')
}

function detectLogFilePath() {
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

function createLoggerInstance(opts) {
    config = parseConfOptions(opts)
    logger = bunyan.createLogger({
        name: config.logRecordName,
        src: config.enableLogSrc,
        streams: [
            {
                type: 'file',
                path: detectLogFilePath()
            }
        ],
        serializers: {
            request: reqSerializer,
            response: resSerializer,
            template: tmpSerializer,
            err: bunyan.stdSerializers.err
        }
    })

    logger.section = getCurrentDateString()
    logger.opts = opts

    return logger
}

function migrateLogFilePath(opts) {
    if (logger.section !== getCurrentDateString()) {
        createLoggerInstance(opts || logger.opts)
    }
}

function reqSerializer(ctx) {
    var ret = {
        method: ctx.method,
        hostname: ctx.hostname ? ctx.hostname : '',
        path: ctx.path,
        headers: ctx._headers
    }

    if (ctx.method.toLowerCase() === 'post') {
        ret.postData = ctx.postData
    }

    return ret
}

function resSerializer(ctx) {
    var ret
    try {
        ret = JSON.parse(ctx.result)
        return JSON.stringify(ret)
    } catch (e) {
        return ct.result
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

function getRecorders() {
    return {
        fatal: wrapper('fatal'),
        error: wrapper('error'),
        warn: wrapper('warn'),
        info: wrapper('info'),
        debug: wrapper('debug'),
        trace: wrapper('trace'),
        request: request(),
        response: response(),
        template: template()
    }
}

function wrapper(level) {
    return function (msg) {
        cacheRecord({
            level: level,
            category: level,
            msg: msg
        })
    }
}

function request() {
    return function (req) {
        cacheRecord({
            category: 'request',
            field: 'request',
            value: req
        })
    }
}

function response() {
    return function (res) {
        cacheRecord({
            category: 'response',
            field: 'response',
            value: res
        })
    }
}

function template() {
    return function (ctx) {
        cacheRecord({
            category: 'template',
            field: 'template',
            value: ctx
        })
    }
}

function cacheRecord(record) {
    if (config.enableSaveInterval) {
        // TODO
    } else if (config.enableSaveBuffer) {
        // TODO
    } else {
        saveRecord(record)
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
        logger[level](fields, msg)
    }
}

function requestSerializeSave(fields) {
    var ctx = fields.request
    var startTime = new Date().getTime()
    var fmtReqMsg = function () {
        // return util.format('%s %s', ctx.method, ctx.agent.protocol + '//' + ctx._headers.host + ctx.path)
        return util.format('%s %s', ctx.method, ctx.agent.protocol + '//' + (ctx.hostname ? ctx.hostname : ctx._headers.host) + ctx.path)
    }

    ctx.startTime = startTime
    ctx.reqId = uuid.v4()

    !config.enableRequestDetail && delete fields.request

    fields.label = 'start'
    fields.reqId = ctx.reqId
    fields.method = ctx.method

    if (ctx.method.toLowerCase() === 'post') {
        fields.postData = ctx.postData
    }

    logger.info(fields, fmtReqMsg())

}

function responseSerializeSave(fields) {
    var ctx = fields.response
    var req = ctx.req
    var duration = new Date().getTime() - req.startTime
    var level = parseLevel(ctx.statusCode, duration)
    var fmtResMsg = function () {
        // return util.format('%s %s %s %dms', req.method, req.agent.protocol + '//' + req._headers.host + req.path, ctx.statusCode, duration)
        return util.format('%s %s %s %dms', req.method, req.agent.protocol + '//' + (req.hostname ? req.hostname : req._headers.host) + req.path, ctx.statusCode, duration)
    }

    !config.enableResponseDetail && delete fields.response

    fields.label = 'finished'
    fields.status = ctx.status
    fields.duration = duration
    fields.reqId = ctx.req.reqId
    fields.method = req.method

    if (req.method.toLowerCase() === 'post') {
        fields.postData = req.postData
    }

    logger[level](fields, fmtResMsg())

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
        logger[level](fields, fmtResMsg())
    }

    !config.enableTemplateDetail && delete fields.template

    fields.label = 'start'
    fields.reqId = ctx.req.reqId
    logger.info(fields, fmtReqMsg())
    onFinished(ctx.response.res, onResFinished)
}

function parseLevel(status, duration) {
    if (status >= 500) {
        return 'error'
    } else if (status >= 400) {
        return 'warn'
    } else {
        if (config.enableReqTimeoutLimit && duration > config.reqTimeoutLimit) {
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
    cacheSeq = []
}

module.exports = function (opts) {
    createLoggerInstance(opts)
    var recorders = getRecorders()

    return function *(next) {
        this.logger = recorders
        this.logger.template(this)
        yield next
    }
}
