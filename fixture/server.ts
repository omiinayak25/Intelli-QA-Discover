/**
 * Local fixture site for QA Discovery Agent. A tiny dependency-free HTTP server
 * exercising: SPA-ish routes, hamburger + hidden drawer, hover menu, accordion,
 * tabs, modal, cookie banner, infinite scroll, pagination, lazy section, a
 * multi-field form (NON-destructive, not submitted), one destructive-looking
 * action (must be SKIPPED-for-safety), a fake login gating User/Admin areas
 * (multi-role), and empty/populated views.
 *
 * BookMyShow-style so the produced deliverables read naturally.
 */

import http from "node:http";

const PORT = Number(process.env.FIXTURE_PORT ?? 4599);

const layout = (title: string, body: string, role = "guest") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body data-role="${role}">
<div class="cookie-banner" data-cookie>We use cookies. <button>Accept</button></div>
<header class="navbar">
  <a href="/" class="logo">ShowBook</a>
  <button class="hamburger" data-menu aria-haspopup="menu" aria-expanded="false">Menu</button>
  <nav aria-label="Primary">
    <a href="/movies">Movies</a>
    <a href="/events">Events</a>
    <a href="/offers">Offers</a>
    <a href="/profile">Profile</a>
  </nav>
  <input type="search" placeholder="Search movies, events" aria-label="Search">
  <div class="has-hover" data-hover>Language
    <div class="hover-menu"><a href="/?lang=en">English</a><a href="/?lang=hi">Hindi</a></div>
  </div>
  <a href="/login" class="login-link">Login</a>
</header>
<aside class="sidebar drawer" hidden>
  <a href="/movies">Now Showing</a><a href="/events">Live Events</a>
</aside>
<main>${body}</main>
<footer>
  <nav aria-label="Footer"><a href="/about">About</a><a href="/contact">Contact</a><a href="/terms">Terms</a>
  <a href="https://external.example.com/partner">Partner Site</a></nav>
</footer>
</body></html>`;

const home = () =>
  layout(
    "ShowBook — Home",
    `<section class="hero carousel" data-carousel><h1>Now Showing</h1></section>
   <section class="filters"><select aria-label="Genre"><option>All</option><option>Action</option><option>Drama</option></select>
     <select aria-label="Language"><option>English</option><option>Hindi</option></select></section>
   <section class="categories"><span class="chip">Action</span><span class="chip">Drama</span></section>
   <section class="movie-cards">
     <article class="card"><a href="/movies/101">Space Odyssey</a></article>
     <article class="card"><a href="/movies/102">The Long Road</a></article>
   </section>
   <section class="lazy" data-lazy loading="lazy"><h2>Recommended</h2></section>
   <nav aria-label="Pagination" class="pagination"><a href="/?page=1">1</a><a href="/?page=2">2</a></nav>`,
  );

const movies = () =>
  layout(
    "ShowBook — Movies",
    `<h1>Movies</h1>
   <section class="filters"><select aria-label="Sort"><option>Popularity</option><option>Rating</option></select></section>
   <div class="movie-cards">
     <article class="card"><a href="/movies/101">Space Odyssey</a></article>
     <article class="card"><a href="/movies/102">The Long Road</a></article>
     <article class="card"><a href="/movies/103">Night City</a></article>
   </div>
   <nav aria-label="Pagination" class="pagination"><a href="/movies?page=2">Next</a></nav>`,
  );

const movieDetail = (id: string) =>
  layout(
    `ShowBook — Movie ${id}`,
    `<h1>Movie ${id}</h1>
   <video controls><source src="/trailer.mp4"></video>
   <div class="ratings">Ratings: 4.5</div>
   <details class="accordion"><summary>Cast &amp; Crew</summary><p>Actor A, Actor B</p></details>
   <details class="accordion"><summary>Reviews</summary><p>Great movie.</p></details>
   <div role="tablist" class="tabs"><button role="tab">Showtimes</button><button role="tab">Similar</button></div>
   <button class="book-btn">Book Now</button>
   <button class="share-btn">Share</button>
   <button class="delete-account">Delete Account</button>
   <div role="dialog" class="modal" hidden><h2>Select Seats</h2></div>`,
  );

const login = () =>
  layout(
    "ShowBook — Login",
    `<h1>Login</h1>
   <form method="post" name="login">
     <label for="username">Email</label><input id="username" name="username" type="email" required>
     <label for="password">Password</label><input id="password" name="password" type="password" required minlength="6">
     <button type="submit">Login</button>
   </form>
   <a href="/forgot">Forgot Password</a>`,
  );

const profile = (role: string) => {
  if (role === "guest") return null;
  return layout(
    "ShowBook — Profile",
    `<h1>Profile</h1>
   <form name="edit-profile" method="post">
     <label for="fullname">Full Name</label><input id="fullname" name="fullname" type="text" required maxlength="50">
     <label for="phone">Phone</label><input id="phone" name="phone" type="tel" pattern="[0-9]{10}">
     <label for="avatar">Avatar</label><input id="avatar" name="avatar" type="file">
     <button type="submit">Save</button>
   </form>
   <a href="/bookings">My Bookings</a>
   ${role === "admin" ? '<a href="/admin">Admin Console</a>' : ""}`,
    role,
  );
};

const admin = (role: string) => {
  if (role !== "admin") return null;
  return layout(
    "ShowBook — Admin",
    `<h1>Admin Console</h1>
   <table><thead><tr><th>User</th><th>Role</th></tr></thead>
     <tbody><tr><td>alice</td><td>user</td></tr></tbody></table>
   <button class="add-user">Create User</button>
   <button class="remove-user">Delete User</button>
   <canvas id="usage-chart" width="200" height="100"></canvas>`,
    role,
  );
};

const events = () => layout("ShowBook — Events", `<h1>Events</h1><div class="movie-cards"><article class="card"><a href="/events/1">Comedy Night</a></article></div>`);
const offers = () => layout("ShowBook — Offers", `<h1>Offers</h1><section class="empty"><p>No offers available.</p></section>`);
const staticPage = (t: string) => layout(`ShowBook — ${t}`, `<h1>${t}</h1><p>${t} content.</p>`);

function roleFromReq(req: http.IncomingMessage): string {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/role=(\w+)/);
  return m ? m[1] : "guest";
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const role = roleFromReq(req);
  const send = (html: string | null, status = 200) => {
    if (html === null) {
      res.writeHead(302, { Location: "/login" });
      res.end();
      return;
    }
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  };

  // fake login: POST sets a role cookie based on username
  if (url.pathname === "/login" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const user = params.get("username") || "";
      const r = user.includes("admin") ? "admin" : user ? "user" : "guest";
      res.writeHead(302, { "Set-Cookie": `role=${r}; Path=/`, Location: "/profile" });
      res.end();
    });
    return;
  }

  const p = url.pathname;
  if (p === "/") return send(home());
  if (p === "/movies") return send(movies());
  if (/^\/movies\/\d+$/.test(p)) return send(movieDetail(p.split("/")[2]));
  if (p === "/events") return send(events());
  if (p === "/offers") return send(offers());
  if (p === "/login") return send(login());
  if (p === "/profile") return send(profile(role));
  if (p === "/admin") return send(admin(role));
  if (["/about", "/contact", "/terms", "/forgot", "/bookings"].includes(p))
    return send(staticPage(p.slice(1)));
  return send(layout("404", "<h1>404 Not Found</h1>"), 404);
});

server.listen(PORT, () => {
  console.log(`Fixture site running at http://localhost:${PORT}`);
});

export { server, PORT };
