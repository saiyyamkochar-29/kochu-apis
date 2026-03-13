# 🌱 kochu-apis
 
> Life is made of tiny moments. This is all of mine, in JSON.

A fully automated digital observatory of my existence. Because if it's not in JSON, did it even happen?

**Live API:** `https://saiyyamkochar-29.github.io/kochu-apis/api.json`

<!-- API_STATUS_START -->
### API Status
- Index: https://saiyyamkochar-29.github.io/kochu-apis/api.json
- Last updated: 2026-03-13T11:00:24.123Z
- Health: 10/10 OK, 0 errors

Endpoints:
- [contributions](/kochu-apis/api/contributions.json) • ok • 2026-03-09T05:02:09.202Z
- [games](/kochu-apis/api/games.json) • ok • 2026-03-13T01:46:46.354Z
- [location](/kochu-apis/api/location.json) • ok • Mar 13, 2026 at 7:00 AM
- [music](/kochu-apis/api/music.json) • ok • null
- [places](/kochu-apis/api/places.json) • ok • null
- [sleep](/kochu-apis/api/sleep.json) • ok • 2026-02-08T17:59:37.167Z
- [steps](/kochu-apis/api/steps.json) • ok • 2026-03-12T23:59:07-04:00
- [todoist](/kochu-apis/api/todoist.json) • ok • 2026-03-09T05:55:25.054Z
- [whatpulse](/kochu-apis/api/whatpulse.json) • ok • 2026-03-03T02:37:14.382Z
- [whatpulse-weekly](/kochu-apis/api/whatpulse-weekly.json) • ok • 2026-03-03T02:37:14.383Z

<!-- API_STATUS_END -->


## 🤔 What is this?

You know how people say "pics or it didn't happen"? Well, I took it further: **data or it didn't happen**.

This repository is my life, quantified. Not in a creepy Black Mirror way, but in a "I'm genuinely curious about patterns in my own existence" way. It's a personal API that automatically collects data about:

- 🎵 **Music** I listen to (via Spotify)
- 👟 **Steps** I take (via Apple Health)
- 😴 **Sleep** I desperately need (via Apple Health)
- 📍 **Places** I visit (via location tracking)
- 💻 **Code** I write (via GitHub Contirbutions)
- 🎮 **Games** I play (via Xbox/PSN)
- 📈 **Computer Activity** I'm definitely not addicted to (via WhatPulse)
- 📝 **Daily Tasks** I pretend I'll finish (via Todoist)
- And whatever else I decide to obsessively track

The best part? **Zero manual input.** Everything runs on GitHub Actions, cron jobs, and iOS Shortcuts. I just live my life; the data follows.

## 🎯 Why though?

Good question. Here are some answers, ranked by how pretentious they sound:

1. **"To understand myself better through data patterns"** - Sounds smart at parties
2. **"For the quantified self movement"** - Okay now we're getting nerdy
3. **"Because I can"** - Honest
4. **"I watched too many YouTube videos about life tracking"** - Very honest
5. **"Boredom during a long weekend"** - Most honest

The real reason: I'm building a digital mirror of my life. In 10 years, I want to know not just what I did, but when, where, and in what context. Did I code more when listening to lo-fi? Do I walk more on sunny days? Was there a correlation between my step count and productivity?

## 🛠️ How it works

**The tl;dr:** Everything is automated. GitHub Actions + iOS Shortcuts → Data goes in → JSON comes out. I just live my life; the robots handle the rest.

**Tech:** TypeScript, Node.js, GitHub Actions, iOS Shortcuts, various APIs, and an unhealthy amount of cron jobs.

## 🌟 Inspiration

Shoutout to the communities that made me think "I should definitely do this":
- [r/QuantifiedSelf](https://reddit.com/r/QuantifiedSelf) - The OGs of life tracking
- [r/DataIsBeautiful](https://reddit.com/r/DataIsBeautiful) - For making me want pretty charts
- Every "My Year in Data" blog post ever
- That one HN thread about personal APIs


## 🔮 Future Plans

Things I want to add (when I have time, which is never, but a man can dream):

- [ ] 🌤️ **Weather correlation** (Does rain make me less productive?)
- [ ] 🌙 **Better Sleep tracking** (Apple Watch, Oura, etc.)
- [ ] 🧠 **Correlation engine** (Find patterns between data streams)
- [ ] 📈 **Dashboard** (Visualize everything in one place)
- [ ] 🤖 **AI analysis** (Let Claude tell me about myself)

---

**Note:** This is a work in progress. Some features mentioned above are aspirational (fancy word for "I haven't built them yet"). The workflows are constantly being refined. The data might be messy. Welcome to real software development.

**Last updated:** Check the commit history, that's literally the point of this project.

---

<p align="center">
  <i>"We are what we repeatedly do. Excellence, then, is not an act, but a habit."</i><br>
  <sub>— Aristotle (who definitely would have loved APIs if he were alive today)</sub>
</p>

<p align="center">
  <i>"If it's not tracked, it's not optimized."</i><br>
  <sub>— Every productivity guru ever</sub>
</p>

<p align="center">
  <i>"What's the use-case?"</i><br>
  <sub>— My friends, probably</sub>
</p>
