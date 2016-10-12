# sword-logger [![NPM version](https://badge.fury.io/js/sword-logger.svg)](https://npmjs.org/package/sword-logger) [![Build Status](https://travis-ci.org/gejiawen/sword-logger.svg?branch=master)](https://travis-ci.org/gejiawen/sword-logger)

> logger middleware for sword group

## Installation

```sh
$ npm install --save sword-logger
```

## Usage

```js
var koa = require('koa')
var swordLogger = require('sword-logger');

var app = koa()
app.use(swordLogger(opts))
```

log file eg, `sword-logger-20160926+0800.log`,

log file content eg,

```
{"name":"sword-logger-20160926+0800","hostname":"Gejiawen.local","pid":71410,"level":30,"category":"template","req_id":"06b0bb2e-72dd-449e-b693-cef8738bdd85","label":"start","msg":"POST localhost:8000/user","time":"2016-09-26T10:32:08.472Z","v":0}
{"name":"sword-logger-20160926+0800","hostname":"Gejiawen.local","pid":71410,"level":30,"category":"template","req_id":"06b0bb2e-72dd-449e-b693-cef8738bdd85","label":"finished","status":200,"duration":1,"msg":"POST localhost:8000/user 200 1ms","time":"2016-09-26T10:32:08.473Z","v":0}
```

extra field as follows,

- `category`
- `reqId`
- `label`
- `duration`
- `template`
- `request`
- `response`

## Methods

- `fatal`
- `error`
- `warn`
- `info`
- `debug`
- `trace`
- `request`
- `response`
- `template`

specify `example/test.js` to get more usage.

## Configuration

`opts` default value as follows,

```
{
    "logFolder": "./logs",
    "logFilePrefix": "sword-logger",
    "logFileSuffix": ".log",
    "logRecordName": "sword-logger-yyyy-m-dd",
    "enableLogSrc": false,
    "enableSaveInterval": false,
    "logSaveInterval": 6e4,
    "enableSaveBuffer": false,
    "logSaveBuffer": 100,
    "enableReqTimeoutLimit": false,
    "reqTimeoutLimit": 1e3,
    "enableRequestDetail": false,
    "enableResponseDetail": false,
    "enableTemplateDetail": false
}
```

- `logFolder`, log folder
- `logFilePrefix`, log file prefix
- `logFileSuffix`, log file suffix
- `logRecordName`, logger instance name
- `enableLogSrc`, enable log src and line number or not
- `enableSaveInterval`, enable write to log file by interval or not
- `logSaveInterval`, interval time, default is 60000ms
- `enableSaveBuffer`, enable write to log file by buffer or not
- `logSaveBuffer`, buffer records number, default is 100
- `enableReqTimeoutLimit`, enable request timeout limit or not
- `reqTimeoutLimit`, request timeout limit, default is 1000ms, sword-logger use `WARN` level when over request timeout limit 
- `enableRequestDetail`, enable request log detail or not
- `enableResponseDetail`, enable response log detail or not
- `enableTemplateDetail`, enable template render log or not


## TODO

- 计时器跨天判定
- 拆分template分类至jade和页面交互
- 缓存写日志策略

## License

MIT © [gejiawen](http://blog.gejiawen.com)
