/* global PM, UrlFetchApp, ScriptApp, MailApp, Session, Logger */
// Property Manager: daily reminders without the Blaze plan (owner choice 2026-11-24).
//
// Runs in the owner's Google account (Google Apps Script, free). Every morning between 9 and
// 10 AM India time it reads the app's data with the owner's own Google login, works out the
// Dashboard reminders with the app's own rules (PM.*, bundled from src/lib), then
//   - sends a phone push to every device that turned on notifications in Settings, and
//   - emails the list to every active family member.
// Nothing is sent when nothing needs attention. No key file is used or stored.
//
// Setup (once): see apps-script/README.md. Run `setup` from the editor and allow access.

var PROJECT_ID = 'property-management-a5e84'
var APP_URL = 'https://property-management-a5e84.web.app'
var FIRESTORE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents'
var FCM = 'https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send'
var COLLECTIONS = ['tenancies', 'tenants', 'flats', 'connections', 'charges', 'payments', 'bills', 'reminders', 'pushTokens', 'members']

// ---------- setup ----------

/** Run once from the editor: asks for permission, then schedules the daily run at 9 AM India time. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyReminders') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('sendDailyReminders').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Kolkata').create()
  Logger.log('Daily reminders scheduled for 9-10 AM India time. Run sendTestToMe to try it now.')
}

/** Sends today's reminders to you only (email and your devices), to check that everything works. */
function sendTestToMe() {
  run_({ onlyMe: true, always: true })
}

/** The daily job (called by the trigger). */
function sendDailyReminders() {
  run_({ onlyMe: false, always: false })
}

// ---------- main ----------

function run_(options) {
  var data = load_()
  var today = PM.todayInKolkata()
  // Include rent periods that have started but were not yet created by the app (not saved here).
  var stored = data.charges
  var charges = stored.concat(
    data.tenancies.flatMap(function (t) {
      return PM.dueRentCharges(
        t,
        stored.filter(function (c) {
          return c.tenancyId === t.id
        }),
        today,
      )
    }),
  )
  var reminders = PM.computeReminders(
    {
      tenancies: data.tenancies,
      tenants: data.tenants,
      flats: data.flats,
      connections: data.connections,
      charges: charges,
      payments: data.payments,
      bills: data.bills,
      ownReminders: data.reminders,
    },
    today,
  )
  var urgent = reminders.filter(function (r) {
    return r.level !== 'upcoming'
  })
  var summary = PM.reminderSummary(reminders)
  if (!summary && !options.always) {
    Logger.log(today + ': nothing needs attention; nothing sent.')
    return
  }

  var me = String(sessionEmail_()).toLowerCase()
  var members = data.members.filter(function (m) {
    return m.active !== false
  })
  var emails = members
    .map(function (m) {
      return String(m.email || m.id).toLowerCase()
    })
    .filter(function (e) {
      return !options.onlyMe || e === me
    })
  if (options.onlyMe && emails.indexOf(me) < 0) emails = [me]
  var tokens = data.pushTokens.filter(function (t) {
    return !options.onlyMe || String(t.email).toLowerCase() === me
  })

  var pushed = sendPush_(tokens, summary || 'Nothing needs attention today.')
  sendEmail_(emails, today, urgent, reminders)
  Logger.log(today + ': ' + (summary || 'nothing urgent') + ' | push sent to ' + pushed + ' device(s), email to ' + emails.length + ' member(s).')
}

function sessionEmail_() {
  return Session.getEffectiveUser().getEmail()
}

// ---------- reading the app's data (Firestore REST, with the owner's Google login) ----------

function request_(url, options) {
  var opts = options || {}
  var headers = {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    // Bill and authorise the call against the app's project (not the script's own project).
    'X-Goog-User-Project': PROJECT_ID,
  }
  var res = UrlFetchApp.fetch(url, {
    method: opts.method || 'get',
    contentType: opts.payload ? 'application/json' : undefined,
    payload: opts.payload ? JSON.stringify(opts.payload) : undefined,
    headers: headers,
    muteHttpExceptions: true,
  })
  var code = res.getResponseCode()
  var text = res.getContentText()
  return { code: code, body: text ? JSON.parse(text) : null }
}

function load_() {
  var out = {}
  COLLECTIONS.forEach(function (name) {
    out[name] = list_(name)
  })
  return out
}

function list_(collection) {
  var docs = []
  var token = ''
  do {
    var url = FIRESTORE + '/' + collection + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : '')
    var res = request_(url)
    if (res.code !== 200) throw new Error('Reading ' + collection + ' failed (' + res.code + '): ' + JSON.stringify(res.body))
    ;(res.body.documents || []).forEach(function (d) {
      var item = decodeFields_(d.fields || {})
      item.id = d.name.split('/').pop()
      docs.push(item)
    })
    token = res.body.nextPageToken || ''
  } while (token)
  return docs
}

/** Firestore REST values → plain JavaScript values (integers stay exact numbers). */
function decodeValue_(v) {
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return { seconds: Math.floor(Date.parse(v.timestampValue) / 1000) }
  if ('mapValue' in v) return decodeFields_(v.mapValue.fields || {})
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue_)
  if ('referenceValue' in v) return v.referenceValue
  return null
}

function decodeFields_(fields) {
  var out = {}
  Object.keys(fields).forEach(function (k) {
    out[k] = decodeValue_(fields[k])
  })
  return out
}

// ---------- phone push (Firebase Cloud Messaging, free on the Spark plan) ----------

function sendPush_(tokens, body) {
  var sent = 0
  tokens.forEach(function (t) {
    var res = request_(FCM, {
      method: 'post',
      payload: {
        message: {
          token: t.id,
          notification: { title: 'Property Manager', body: body },
          webpush: { fcm_options: { link: APP_URL + '/' } },
        },
      },
    })
    if (res.code === 200) {
      sent++
    } else if (res.code === 404 || (res.code === 400 && /registration token|INVALID_ARGUMENT|UNREGISTERED/.test(JSON.stringify(res.body)))) {
      // This device no longer accepts notifications: forget it.
      request_(FIRESTORE + '/pushTokens/' + encodeURIComponent(t.id), { method: 'delete' })
    } else {
      Logger.log('Push failed (' + res.code + '): ' + JSON.stringify(res.body))
    }
  })
  return sent
}

// ---------- email summary ----------

var LEVEL_LABEL = { overdue: 'Overdue', soon: 'Soon', upcoming: 'Coming up' }

function escape_(text) {
  return String(text).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  })
}

/** Subject, plain text and HTML of the daily email. Pure (no Apps Script services). */
function emailContent_(today, urgent, all) {
  var later = all.filter(function (r) {
    return r.level === 'upcoming'
  })
  var subject = urgent.length
    ? 'Property Manager: ' + urgent.length + ' thing' + (urgent.length === 1 ? '' : 's') + ' need attention (' + today + ')'
    : 'Property Manager: nothing urgent today (' + today + ')'
  var lines = []
  var rows = []
  function add(r) {
    lines.push('- [' + LEVEL_LABEL[r.level] + '] ' + r.title + ' - ' + r.detail)
    var color = r.level === 'overdue' ? '#b42318' : r.level === 'soon' ? '#9a5b00' : '#5b6662'
    rows.push(
      '<tr><td style="padding:6px 10px;color:' + color + ';font-weight:600;white-space:nowrap">' + LEVEL_LABEL[r.level] + '</td>' +
        '<td style="padding:6px 10px"><strong>' + escape_(r.title) + '</strong><br><span style="color:#5b6662">' + escape_(r.detail) + '</span></td></tr>',
    )
  }
  urgent.forEach(add)
  later.forEach(add)
  if (!rows.length) {
    lines.push('Nothing needs attention today.')
    rows.push('<tr><td style="padding:6px 10px">Nothing needs attention today.</td></tr>')
  }
  var text = 'Reminders for ' + today + ':\n\n' + lines.join('\n') + '\n\nOpen the app: ' + APP_URL
  var html =
    '<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;font-size:15px;color:#1c2321">' +
    '<p>Reminders for <strong>' + today + '</strong></p>' +
    '<table style="border-collapse:collapse">' + rows.join('') + '</table>' +
    '<p style="margin-top:16px"><a href="' + APP_URL + '">Open Property Manager</a></p>' +
    '<p style="color:#5b6662;font-size:12px">Sent daily at about 9 AM to active family members. To stop it, the owner turns off the trigger in Google Apps Script.</p>' +
    '</div>'
  return { subject: subject, text: text, html: html }
}

function sendEmail_(emails, today, urgent, all) {
  if (!emails.length) return
  var c = emailContent_(today, urgent, all)
  MailApp.sendEmail({ to: emails[0], bcc: emails.slice(1).join(','), subject: c.subject, body: c.text, htmlBody: c.html, name: 'Property Manager' })
}
