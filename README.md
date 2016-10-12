# sword-logger [![NPM version](https://badge.fury.io/js/sword-logger.svg)](https://npmjs.org/package/sword-logger) [![Build Status](https://travis-ci.org/gejiawen/sword-logger.svg?branch=master)](https://travis-ci.org/gejiawen/sword-logger)

> logger middleware for sword group

sword-logger中间件将所有的日志分为如下几大类（**category**），

fatal、error、warn、info、trace、debug
request、response、render、action

其中第一行的6种其实是bunyan自带日志等级的alias，
第二行是根据不同业务场景抽象出来的。

- `request`，Nodejs程序向rest服务器发送rest api请求的日志
- `response`，rest服务器返回给Nodejs程序的rest api响应的日志
- `render`，服务端模板的渲染日志，这里所谓的渲染日志其实是跟客户端（浏览器）是没有关系的，它仅仅表示模板文件和数据的组装和编译过程
- `action`，所有由用户发起从而产生的交互日志，包括页面请求、表单提交、客户端ajax请求等等

每一条日志都是一个record抽象，每个record实例在category的维度下，还会有**level**的区分，
常用record的level有如下几种

- info
- warn
- error

## Installation

```sh
$ npm install --save sword-logger
```

## Usage

```js
var koa = require('koa')
var bodyparser = require('koa-bodyparser')
var swordLogger = require('sword-logger');

var app = koa()
app.use(bodyparser()) // use bodyparser before swordLogger when you need enableActionLogger
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
- `request`
- `response`
- `action`

## Methods

- `fatal`
- `error`
- `warn`
- `info`
- `debug`
- `trace`
- `request`
- `response`
- `render`
- `action`

specify `example/test.js` to get more usage.

## Configuration

`opts` default value as follows,

```
{
    "logFolder": "",
    "logFilePrefix": "sword-logger",
    "logFileSuffix": ".log",
    "logRecordName": "sword-logger-" + getCurrentDateString(),
    "enableLogSrc": false,
    "enableSaveInterval": false,
    "logSaveInterval": 6e4,
    "enableSaveBuffer": false,
    "logSaveBuffer": 100,
    "enableDurationLimit": true,
    "durationLimit": 5e3,
    "enableCache": true,
    "enableRequestDetail": true,
    "enableResponseDetail": true,
    "enableActionLogger": true,
    "enableActionDetail": true
}
```

- `logFolder`, log folder, **REQUIRED**
- `logFilePrefix`, log file prefix
- `logFileSuffix`, log file suffix
- `logRecordName`, logger instance name
- `enableLogSrc`, enable log src and line number or not
- `enableSaveInterval`, enable write to log file by interval or not
- `logSaveInterval`, interval time, default is 60000ms
- `enableSaveBuffer`, enable write to log file by buffer or not
- `logSaveBuffer`, buffer records number, default is 100
- `enableDurationLimit`, enable duration timeout limit or not
- `durationLimit`, duration timeout limit, default is 5000ms, sword-logger use `WARN` level when over duration timeout limit 
- `enableRequestDetail`, enable request log detail or not
- `enableResponseDetail`, enable response log detail or not
- `enableActionLogger`, enable action log or not
- `enableActionDetail`, enable action detail log or not


## TODO

- 计时器跨天判定(*deprecated*)
- 缓存写日志策略

## License

MIT © [gejiawen](http://blog.gejiawen.com)
