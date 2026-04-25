const fs = require('fs');

const content = fs.readFileSync('app/reply/page.tsx', 'utf-8');

const targetStr = `  if (!user) {
    return (
      <main className="reply-app-shell reply-app-shell--center">
        <form className="reply-signin" onSubmit={signIn}>
          <a href="/" className="site-header__brand-link" style={{ textDecoration: 'none', marginBottom: 12 }}>
            <img src="/logo.png" alt="" style={{ width: 42, height: 42, marginRight: 12, borderRadius: 6, verticalAlign: 'middle', boxShadow: '0 0 42px rgba(240, 161, 58, 0.1)' }} />
            <span style={{ fontSize: '1.4rem' }}><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
          </a>
          <span className="eyebrow">local account</span>
          <h1>{authMode === "create" ? "Create your reply account." : "Sign in to reply."}</h1>
          <p>
            Pick a display name and passcode. Stayhand will resume your bot and invite conversations from this browser.
          </p>
          <div className="reply-auth-toggle">
            <button type="button" className={authMode === "sign-in" ? "is-active" : ""} onClick={() => setAuthMode("sign-in")}>
              Sign in
            </button>
            <button type="button" className={authMode === "create" ? "is-active" : ""} onClick={() => setAuthMode("create")}>
              Create account
            </button>
          </div>
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ari" />
          </label>
          <label>
            Passcode
            <input
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="something memorable"
            />
          </label>
          {authError && <p className="reply-error">{authError}</p>}
          <button type="submit" className="button primary">
            {authMode === "create" ? "Create account" : "Sign in"}
          </button>
        </form>
      </main>
    );
  }`;

const replacementStr = `  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = "/login?callbackUrl=/reply";
    }
    return <main className="reply-app-shell reply-app-shell--center" />;
  }`;

const fixed = content.replace(targetStr, replacementStr);
fs.writeFileSync('app/reply/page.tsx', fixed);
console.log('Fixed app/reply/page.tsx');
