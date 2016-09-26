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
    enableResponseDetail: false,
    enableTemplateDetail: false
}
var logger = null
var config = null
var cacheSeq = []
var g_fields = {}

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

    return logger
}

function reqSerializer(ctx) {

}

function resSerializer(ctx) {

}

function tmpSerializer(ctx) {
    var req = ctx.request.req
    var res = ctx.response.res

    if (!res.finished) {
        if (!req || !req.connection)
            return req
        return {
            method: req.method,
            url: req.url,
            headers: req.headers,
            remoteAddress: req.connection.remoteAddress,
            remotePort: req.connection.remotePort
        }
    } else {
        if (!res || !res.statusCode)
            return res;
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
    var level = record.level
    var category = record.category
    var field = record.field
    var value = record.value
    var msg = record.msg

    var fields = {}
    fields.category = category

    if (_.includes(['request', 'response', 'template'], category)) {
        fields[field] = value
        fields = _.extend(fields, g_fields)

        switch (category) {
            case 'request':
                requestSerializeSave(fields)
                break;
            case 'response':
                responseSerializeSave(fields)
                break;
            case 'template':
                templateSerializeSave(fields)
                break
        }
    } else {
        fields = _.extend(fields, g_fields)
        logger[level](fields, msg)
    }
}

function requestSerializeSave(fields) {
    var ctx = fields.request
    var startTime = new Date().getTime()
    var level
    var duration
}

function responseSerializeSave(fields) {
    var ctx = fields.response
    var startTime = new Date().getTime()
    var level
    var duration
}

function templateSerializeSave(fields) {
    var ctx = fields.template
    var startTime = new Date().getTime()
    var level
    var duration
    var fmtReqMsg = function() {
        return util.format('%s %s%s', ctx.req.method, ctx.req.headers.host, ctx.req.url)
    }
    var fmtResMsg = function() {
        return util.format('%s %s%s %d %sms', ctx.req.method, ctx.req.headers.host, ctx.req.url, ctx.status, duration);
    }
    var onResFinished = function() {
        duration = new Date().getTime() - startTime
        level = parserLevel(ctx.status, duration)
        fields.label = 'finished'
        fields.status = ctx.status
        fields.duration = duration
        logger[level](fields, fmtResMsg())
    }

    !config.enableTemplateDetail && delete fields.template

    fields.label = 'start'
    logger.info(fields, fmtReqMsg())
    onFinished(ctx.response.res, onResFinished);
}

function parserLevel(status, duration) {
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

function addReqId(ctx) {
    var header = 'X-Request-Id'
    var ctxProp = 'reqId'
    var requestProp = 'reqId'
    var field = 'req_id'

    var reqId = ctx.request.get(header) || uuid.v4()
    ctx[ctxProp] = reqId
    ctx.request[requestProp] = reqId
    // fields.req_id = reqId

    g_fields[field] = reqId
}

module.exports = function (opts) {
    createLoggerInstance(opts)
    var recorders = getRecorders()

    return function *(next) {
        addReqId(this)
        this.logger = recorders
        this.logger.template(this)
        yield next
    }
}
