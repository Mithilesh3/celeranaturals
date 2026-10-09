"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type AuthTab = "login" | "register" | "forgot";

export default function AccountPage() {
  const [tab, setTab] = useState<AuthTab>("login");
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("Account access is not connected yet. No sign-in or account request was sent.");
  };
  const selectTab = (next: AuthTab) => { setTab(next); setNotice(""); };

  return (
    <main className="store-page site-redesign account-page">
      <div className="store-container">
        <header className="store-page-heading"><div><p className="store-eyebrow">Your Celeranaturals account</p><h1>Account access</h1><p className="store-lede">Sign-in and registration are not connected yet. Your guest cart and wishlist remain available on this device.</p></div></header>
        <div className="account-layout">
          <section className="account-info-panel"><span className="account-mark" aria-hidden="true">C</span><p className="store-eyebrow">Wellness, made personal</p><h2>Keep your favourites close.</h2><p>When account services are available, this space will help you manage your profile, saved products and order history.</p><ul><li>Browse products without an account</li><li>Keep a wishlist on this device</li><li>Manage your cart while you shop</li></ul><a className="store-text-link" href="/shop">Continue browsing →</a></section>
          <section className="account-card" aria-label="Account options">
            <div className="account-tabs" role="tablist" aria-label="Account options">
              {(["login", "register", "forgot"] as AuthTab[]).map((item) => <button key={item} type="button" role="tab" id={`account-tab-${item}`} aria-controls="account-panel" aria-selected={tab === item} className={tab === item ? "is-active" : ""} onClick={() => selectTab(item)}>{item === "forgot" ? "Reset password" : item === "register" ? "Create account" : "Sign in"}</button>)}
            </div>
            <div id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${tab}`}>
              {tab === "login" && <form className="account-form" onSubmit={submit}><div className="account-form-heading"><h2>Welcome back</h2><p>Enter your details to access your account.</p></div><label>Email address<input type="email" autoComplete="email" required /></label><label>Password<span className="account-password-field"><input type={visible.login ? "text" : "password"} autoComplete="current-password" required /><button type="button" onClick={() => setVisible((state) => ({ ...state, login: !state.login }))}>{visible.login ? "Hide" : "Show"}</button></span></label><button className="store-button store-button-primary" type="submit">Sign in</button></form>}
              {tab === "register" && <form className="account-form" onSubmit={submit}><div className="account-form-heading"><h2>Create your account</h2><p>Registration is not connected yet.</p></div><label>Full name<input type="text" autoComplete="name" required /></label><label>Email address<input type="email" autoComplete="email" required /></label><label>Create password<span className="account-password-field"><input type={visible.register ? "text" : "password"} autoComplete="new-password" required /><button type="button" onClick={() => setVisible((state) => ({ ...state, register: !state.register }))}>{visible.register ? "Hide" : "Show"}</button></span></label><button className="store-button store-button-primary" type="submit">Create account</button></form>}
              {tab === "forgot" && <form className="account-form" onSubmit={submit}><div className="account-form-heading"><h2>Reset your password</h2><p>Password reset is not connected yet.</p></div><label>Registered email<input type="email" autoComplete="email" required /></label><button className="store-button store-button-primary" type="submit">Show account status</button></form>}
              {notice && <p className="account-notice" role="status">{notice}</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
