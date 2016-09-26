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

var logger = null
var config = null
var cacheSeq = []
var g_fields = {}

function parseConfOptions(opts) {
    opts = opts || {}

    return {
        logFolder: opts.logFolder || './logs',
        logFilePrefix: opts.logFilePrefix || 'sword-logger',
        logFileSuffix: opts.logFileSuffix || '.log',
        logRecordName: opts.logRecordName || 'sword-logger-' + getCurrentDateString(),
        enableLogSrc: !!opts.enableLogSrc,
        enableSaveInterval: !!opts.enableSaveInterval,
        logSaveInterval: opts.logSaveInterval || 6e4,
        enableSaveBuffer: !!opts.enableSaveBuffer,
        logSaveBuffer: opts.logSaveBuffer || 100,
        enableReqTimeoutLimit: !!opts.enableReqTimeoutLimit,
        reqTimeoutLimit: opts.reqTimeoutLimit || 1e3,
        enableRequestDetail: !!opts.enableRequestDetail,
        enableResponseDetail: !!opts.enableResponseDetail,
        enableTemplateDetail: !!opts.enableTemplateDetail
    }
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
        serializeSave(fields, field)
    } else {
        fields = _.extend(fields, g_fields)
        logger[level](fields, msg)
    }
}

function serializeSave(fields, field) {
    var ctx = fields[field]
    var reqData = {
        req: ctx.req
    }
    var resData = {
        req: ctx.req,
        res: ctx.res
    }
    var startTime = new Date().getTime()
    var level
    var fmtReqMsg = function(data) {
        return util.format('%s %s%s', ctx.request.method, ctx.request.req.headers.host, ctx.request.originalUrl)
    }
    var fmtResMsg = function(data) {
        return util.format('%s %s%s %d %sms', ctx.request.method, ctx.request.req.headers.host, ctx.request.originalUrl, ctx.status, data.duration);
    }
    var onResFinished = function() {
        resData.duration = new Date().getTime() - startTime
        level = parserLevel(ctx.status, resData.duration)
        fields.label = 'finished'
        fields.status = ctx.status
        fields.duration = resData.duration
        logger[level](fields, fmtResMsg(resData))
    }

    if (!config.enableTemplateDetail && field === 'template') {
        delete fields[field]
    }

    fields.label = 'start'
    logger.info(fields, fmtReqMsg(reqData))
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
