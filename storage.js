
(() => {
  const NS = 'psys:v1';

  const load = (key, defVal) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? defVal; }
    catch { return defVal; }
  };
  const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));
  const uuid = () => (globalThis.crypto?.randomUUID?.() || (Date.now()+'-'+Math.random().toString(16).slice(2)));

  const getTeams = () => load(`${NS}:teams`, []);
  const setTeams = (arr) => save(`${NS}:teams`, arr);

  const usersKey = (teamId) => `${NS}:users:${teamId}`;
  const getUsers = (tid) => load(usersKey(tid), []);
  const setUsers = (tid, arr) => save(usersKey(tid), arr);

  const sessionKey = (tid, uid, rid) => `${NS}:sessions:${tid}:${uid}:${rid}`;
  const getSession = (tid, uid, rid) => load(sessionKey(tid, uid, rid), null);
  const setSession = (tid, uid, rid, s) => save(sessionKey(tid, uid, rid), s);

  const lastSessionKey = (tid, uid) => `${NS}:lastSession:${tid}:${uid}`;
  const getLastSessionMetaForUser = (tid, uid) => load(lastSessionKey(tid, uid), null);
  const setLastSessionMetaForUser = (meta) => {
    if (!meta?.teamId || !meta?.userId || !meta?.runId) return;
    save(lastSessionKey(meta.teamId, meta.userId), {
      teamId: meta.teamId,
      userId: meta.userId,
      runId: meta.runId,
      storedAt: new Date().toISOString()
    });
  };

  function ensureTeam(teamName) {
    const teams = getTeams();
    let t = teams.find(x => x.teamName === teamName);
    if (!t) {
      t = { teamId: uuid(), teamName, createdAt: new Date().toISOString() };
      teams.push(t); setTeams(teams);
    }
    return t;
  }

  function ensureUser(teamId, name, title) {
    const users = getUsers(teamId);
    let u = users.find(x => x.name === name && x.title === title);
    if (!u) {
      u = { userId: uuid(), teamId, name, title, hidden: false, createdAt: new Date().toISOString() };
      users.push(u); setUsers(teamId, users);
    }
    return u;
  }

  function startRun(teamName, testerName, title) {
    const team = ensureTeam(teamName);
    const user = ensureUser(team.teamId, testerName, title);
    const runId = uuid();
    const sess = {
      runId, teamId: team.teamId, userId: user.userId,
      startedAt: new Date().toISOString()
    };
    setSession(team.teamId, user.userId, runId, sess);
    sessionStorage.setItem(`${NS}:currentSession`, JSON.stringify({ teamId: team.teamId, userId: user.userId, runId }));
    return { team, user, runId };
  }

  function setCurrentSession(meta) {
    sessionStorage.setItem(`${NS}:currentSession`, JSON.stringify(meta));
  }

  function getCurrentSessionMeta() {
    const raw = sessionStorage.getItem(`${NS}:currentSession`);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function saveStep(partName, data) {
    const meta = getCurrentSessionMeta();
    if (!meta) throw new Error('No current session. Please startRun() first.');
    const sess = getSession(meta.teamId, meta.userId, meta.runId) || { runId: meta.runId, teamId: meta.teamId, userId: meta.userId, startedAt: new Date().toISOString() };
    sess[partName] = data;
    setSession(meta.teamId, meta.userId, meta.runId, sess);
    setLastSessionMetaForUser(meta);
    return sess;
  }

  function saveComputed(computed) {
    const meta = getCurrentSessionMeta();
    if (!meta) throw new Error('No current session.');
    const sess = getSession(meta.teamId, meta.userId, meta.runId) || { runId: meta.runId, teamId: meta.teamId, userId: meta.userId, startedAt: new Date().toISOString() };
    sess.computed = computed;
    sess.completedAt = new Date().toISOString();
    setSession(meta.teamId, meta.userId, meta.runId, sess);
    setLastSessionMetaForUser(meta);
    return sess;
  }

  function getLatestCompletedSessionForUser(teamId, userId) {
    const prefix = `${NS}:sessions:${teamId}:${userId}:`;
    const runs = [];
    for (let i=0;i<localStorage.length;i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const s = load(k, null);
        if (s?.computed && s?.completedAt) runs.push(s);
      }
    }
    runs.sort((a,b)=> new Date(b.completedAt) - new Date(a.completedAt));
    return runs[0] || null;
  }

  function aggregateTeam(teamId) {
    const users = getUsers(teamId).filter(u => !u.hidden);
    const perUser = [];
    const acc = { structure: [], ecology: [], potentialA: [], potentialB: [] };
    let n = 0;
    for (const u of users) {
      const s = getLatestCompletedSessionForUser(teamId, u.userId);
      if (!s?.computed) continue;
      perUser.push({ name: u.name, title: u.title, runId: s.runId, completedAt: s.completedAt, computed: s.computed });
      const addVec = (key) => {
        const arr = s.computed[key];
        if (!Array.isArray(arr)) return;
        for (let i=0;i<arr.length;i++) {
          acc[key][i] = (acc[key][i] || 0) + arr[i];
        }
      };
      addVec('structure'); addVec('ecology'); addVec('potentialA'); addVec('potentialB');
      n++;
    }
    const avgVec = (key)=> acc[key].length ? acc[key].map(x=> +(x / Math.max(1,n)).toFixed(2)) : [];
    return { count: n, perUser, teamAvg: {
      structure: avgVec('structure'),
      ecology: avgVec('ecology'),
      potentialA: avgVec('potentialA'),
      potentialB: avgVec('potentialB'),
    }};
  }

  function setUserHidden(teamId, userId, hidden) {
    const users = getUsers(teamId);
    const idx = users.findIndex(u => u.userId === userId);
    if (idx >= 0) { users[idx].hidden = !!hidden; setUsers(teamId, users); }
  }

  // Expose minimal API
  window.PSYS = {
    NS, getTeams, setTeams, getUsers, setUsers,
    getSession, setSession,
    ensureTeam, ensureUser, startRun, setCurrentSession, getCurrentSessionMeta,
    saveStep, saveComputed, getLatestCompletedSessionForUser, aggregateTeam,
    setUserHidden,
    getLastSessionMetaForUser,
    setLastSessionMetaForUser
  };
})();
