# TWS Cross-Channel Loyalty System Design

**Date:** 2026-03-07
**Status:** Approved
**Brand:** Trading With Sidhant (tradingwithsidhant.com)
**Goal:** Community stickiness — keep people in the ecosystem long-term
**Scope:** All major platforms, starting with YouTube livestreams

---

## 1. Point Earning System

### 1.1 Per-Livestream Actions

| Action | Points | Category |
|---|---|---|
| Show up (attend stream) | 15 | Presence |
| Watch time (25% of stream) | 5 | Presence |
| Watch time (50% of stream) | 10 | Presence |
| Watch time (75% of stream) | 15 | Presence |
| Watch time (100% of stream) | 20 | Presence |
| Stay till CTA | 30 | Funnel — streamer marks CTA timestamp; viewers present at that moment earn bonus |
| Standard code redemption | 25 | Engagement |
| Flash code redemption | 50 | Engagement |
| First response code | 75 | Engagement |
| Bonus code redemption | 40 | Engagement |
| Chat activity | 5-15 | Capped, scaled by message count |
| Answer a poll | 15 | Streamer launches poll; participation earns points |
| Ask a quality question | 20 | Mod or streamer marks via `!goodq @username` |
| Receive `!helpful` upvote | 5 per upvote (cap 25/stream) | Peer-recognized community contribution |

### 1.2 Off-Stream Actions

| Action | Points | Notes |
|---|---|---|
| Submit homework | 30 | Post trading homework (journal entry, chart analysis) via viewer portal; mod-verified |
| Refer a friend who attends a stream | 50 | Unique referral link; friend must attend 1 full stream |
| Refer a friend who buys a course | 500 | Verified purchase through referral link |
| Complete a course module | 100 | Verified via LMS integration |
| Complete an entire course | 500 | Verified via LMS integration |

### 1.3 Multipliers

| Status | Multiplier |
|---|---|
| Regular viewer | 1.0x |
| YouTube channel member | 1.25x |
| Moderator | 1.5x |
| Course buyer (any) | 1.3x |
| Premium cohort buyer (TWS 1%) | 1.5x |

Multipliers stack multiplicatively on base points, capped at 2.0x total.

### 1.4 Streak System

Linear scaling with cap:

| Streak | Daily Bonus |
|---|---|
| Day 2 | +10 |
| Day 3 | +15 |
| Day 4 | +20 |
| Day 5+ | +25 (capped) |

### 1.5 Streak Milestones

Logarithmic spacing for "surprise and delight" moments:

| Milestone | Bonus |
|---|---|
| 7-day streak | +100 |
| 14-day streak | +150 |
| 30-day streak | +400 |
| 60-day streak | +800 |
| 100-day streak | +1,500 |
| 200-day streak | +3,000 |
| 365-day streak | +7,500 |

### 1.6 Pause System

- 3-day pause: free, 2 per month. Streak doesn't break.
- 7-day pause: costs 500 points, 1 per month. For vacations/breaks.
- Pauses don't stack — must use one before activating another.

### 1.7 Estimated Monthly Earnings

| Viewer Type | Streams/Month | Points/Month |
|---|---|---|
| Casual (drops in occasionally) | 8-10 | ~1,000-1,500 |
| Regular (most streams, some homework) | 15-20 | ~2,500-4,000 |
| Dedicated (daily, streaks, homework, referrals) | 25+ | ~4,500-7,000 |

---

## 2. Tier System

### 2.1 Free Tiers (Everyone)

| Tier | Lifetime Points | Time to Reach (Regular) | Badge Color |
|---|---|---|---|
| Paper Trader | 0 | Immediate | Gray |
| Retail Trader | 2,500 | ~1 month | Green |
| Swing Trader | 10,000 | ~3-4 months | Blue |
| Fund Manager | 35,000 | ~10-12 months | Purple |
| Market Maker | 100,000 | ~2+ years | Gold |

### 2.2 Prestige Tiers (Course/Cohort Buyers Only)

#### Hedge Fund

All required:
- 200,000 lifetime points
- Purchased any paid course
- Completed the course (verified via LMS)
- 400+ streams attended
- Account age 12+ months
- Community contribution threshold met (peer upvote score)

Badge: Diamond/Platinum

#### Whale

All required:
- 400,000 lifetime points
- Purchased premium cohort (TWS 1%)
- Completed the premium cohort (verified via LMS)
- 800+ streams attended
- Account age 24+ months
- Top community contributor (mod-verified, top-tier peer upvote score)

Badge: Animated/Glowing special badge

### 2.3 Tier Benefits (Funnel-Aligned)

| Tier | Unlocks |
|---|---|
| Paper Trader | Basic rewards, leaderboard visibility, referral link |
| Retail Trader | 10% earning boost, mid-tier rewards, free workshop invitations appear in reward catalog |
| Swing Trader | 20% earning boost, module unlock rewards appear, priority in flash codes, superfan tag in CRM |
| Fund Manager | 35% earning boost, course discount/free course rewards appear, monthly AMA access, targeted cohort offers surfaced |
| Market Maker | 50% earning boost, all rewards unlocked, early access to new cohorts at discount, recognition in streams |
| Hedge Fund | All above + portfolio review, private trading room, personal cohort invitation from Sidhant |
| Whale | All above + offline meetup invite, verified trader badge, lifetime inner circle access |

### 2.4 Tier Maintenance & Decay

- Evaluation window: rolling 90 days
- Soft decay: drop only one tier at a time, never a full reset
- Grace period: 30 days warning before demotion
- Active pauses don't count against the 90-day window
- Points balance stays intact even if tier drops
- Prestige tiers: no decay (earned permanently)

| Tier | 90-Day Maintenance Requirement |
|---|---|
| Retail Trader | 750 pts (~10 streams/month) |
| Swing Trader | 3,000 pts (~15 streams/month) |
| Fund Manager | 10,500 pts (~20 streams/month + streaks) |
| Market Maker | 30,000 pts (~25 streams/month + consistent streaks) |

---

## 3. Rewards Catalog (Value-Ladder Aligned)

Funnel progression: free resources -> workshop -> module unlock -> course discount -> full course -> group coaching -> 1-on-1 mentoring -> inner circle

### 3.1 Gateway Rewards (1-4 weeks)

Purpose: First wins + entry to the value ladder

| Reward | Points | Tier Required | Funnel Role |
|---|---|---|---|
| Stream shout-out | 2,000 | Paper Trader | Recognition / emotional |
| Pre-market checklist PDF | 2,500 | Paper Trader | Free resource / taste of paid content |
| Position sizing calculator | 3,000 | Paper Trader | Free resource / taste of paid content |
| Trading plan template (Sidhant's framework) | 3,000 | Retail Trader | Free resource / taste of paid content |
| Free workshop invitation | 3,500 | Retail Trader | Gateway to paid courses |

### 3.2 Engagement Rewards (1-3 months)

Purpose: Deepen investment + preview paid content

| Reward | Points | Tier Required | Funnel Role |
|---|---|---|---|
| Custom Pine Script indicator | 7,000 | Retail Trader | Trading tool / demonstrates expertise |
| Unlock 1 course module (choose from any course) | 8,000 | Swing Trader | Taste paid content -> drives full course purchase |
| Weekly watchlist access (1 month) | 8,000 | Swing Trader | Ongoing value / habit-forming |
| 10% off any course | 10,000 | Retail Trader | Discount ladder step 1 |
| Group trade review session (recorded, monthly) | 12,000 | Swing Trader | Preview of mentorship experience |
| TWS branded mug | 10,000 | Paper Trader | Merch / identity |

### 3.3 Commitment Rewards (3-6 months)

Purpose: Convert to course buyer

| Reward | Points | Tier Required | Funnel Role |
|---|---|---|---|
| 25% off any course | 18,000 | Swing Trader | Discount ladder step 2 |
| Exclusive community access (private Telegram, 1 month) | 20,000 | Swing Trader | Taste of inner circle -> retention + high-ticket |
| Monthly AMA/Q&A access (1 session) | 20,000 | Swing Trader | Direct access to Sidhant |
| TWS merch bundle (mug + t-shirt + journal) | 22,000 | Retail Trader | Identity / belonging |
| 50% off any course | 30,000 | Fund Manager | Discount ladder step 3 -- strong conversion push |

### 3.4 Premium Rewards (6-12+ months)

Purpose: Maximize lifetime value

| Reward | Points | Tier Required | Funnel Role |
|---|---|---|---|
| Free basic course (Options, Crypto, etc.) | 40,000 | Fund Manager | Full course access earned through loyalty |
| 1-on-1 trade review with Sidhant (30 min) | 50,000 | Fund Manager | Premium experience -> upsell to mentorship |
| Free premium course | 75,000 | Market Maker | High-value conversion |
| 1-on-1 mentoring with Sidhant (60 min) | 80,000 | Market Maker | Highest-value direct access |

### 3.5 Prestige-Only Rewards

Purpose: Exclusive status for proven community members

| Reward | Points | Tier Required | Funnel Role |
|---|---|---|---|
| Portfolio review by Sidhant | 60,000 | Hedge Fund | Deep personalized value |
| Private live trading room (1 month) | 75,000 | Hedge Fund | Inner circle experience |
| Lifetime private community access | 80,000 | Whale | Permanent inner circle -- highest retention |
| Offline meetup/retreat invitation | 80,000 | Whale | Real-world connection |
| TWS Verified Trader badge (brokerage proof) | 100,000 | Whale | Status + credibility |

### 3.6 Rotating/Limited-Time Rewards

- Double points weekends: 1-2x per month, announced during streams
- Flash merch drops: seasonal limited-edition items
- Limited 1-on-1 slots: 3 per month, first come first served
- Early bird cohort discount: available only to Fund Manager+ for 48 hours before public launch

---

## 4. Referral System

| Event | Referrer Gets | Referred Gets |
|---|---|---|
| Friend attends first stream | 50 pts | 25 pts welcome bonus |
| Friend reaches Retail Trader tier | 100 pts | -- |
| Friend buys any course | 500 pts | 5% discount on their purchase |
| Friend buys premium cohort | 1,000 pts | 10% discount on cohort |

- Each viewer gets a unique referral link via the viewer portal
- Referral tracked by link click -> account creation -> verified actions
- Cap: max 20 referral bonuses per month (prevents gaming)

---

## 5. Superfan Segmentation & Targeted Offers

The system automatically tags viewers based on behavior and surfaces targeted offers:

| Segment | Criteria | Action Triggered |
|---|---|---|
| Warming Lead | Retail Trader + 10+ streams + never purchased | Surface "Free Workshop" prominently + push 10% discount |
| Hot Lead | Swing Trader + 20+ streams + redeemed module unlock | Surface 25-50% course discount + social proof ("X viewers like you bought the cohort") |
| At-Risk Fan | Was active, hasn't attended in 14+ days | "We miss you" notification + double points on next stream |
| Superfan | Fund Manager+ with 30+ day streak | Tag in CRM, surface early cohort access, personal invite from Sidhant |
| Whale Candidate | Market Maker + course buyer + high community contribution | Route to high-ticket sales flow, personal outreach |

Segments are auto-calculated and:
- CRM tag sync: push segment labels to CRM via webhook
- Viewer portal: show different reward recommendations based on segment
- Admin dashboard: show segment counts and conversion rates

---

## 6. Integration Architecture

### 6.1 Webhooks (Outbound Events)

| Event | Payload | Use Case |
|---|---|---|
| `viewer.tier_changed` | viewer ID, old tier, new tier | CRM tag update, email sequence trigger |
| `viewer.reward_redeemed` | viewer ID, reward type, reward details | LMS enrollment, coupon generation, fulfillment |
| `viewer.segment_changed` | viewer ID, old segment, new segment | CRM automation, targeted email |
| `viewer.referral_converted` | referrer ID, referred ID, event type | Referral tracking, attribution |
| `viewer.milestone_reached` | viewer ID, milestone type, value | Celebration email, social proof |
| `stream.ended` | stream stats, top earners, attendance count | Post-stream recap email |

### 6.2 LMS Integration

| Feature | How |
|---|---|
| Course completion verification | LMS webhook -> our API marks course as completed on viewer profile |
| Module unlock fulfillment | Our system -> LMS API grants access to specific module |
| Course enrollment on reward redemption | Our system -> LMS API enrolls student when "free course" reward redeemed |

### 6.3 CRM Integration

| Feature | How |
|---|---|
| Viewer profile sync | Viewer email + tier + segment -> CRM contact tags |
| Purchase attribution | CRM purchase event -> our API credits referral + marks viewer as buyer |
| Targeted email triggers | Segment change webhook -> CRM automation triggers appropriate sequence |

---

## 7. KPIs & Analytics Dashboard

### 7.1 Core KPIs

| KPI | Definition | How Measured |
|---|---|---|
| Repeat attendance rate | % of viewers who attend 2+ streams in 30 days | StreamAttendance records per viewer per period |
| Lead-to-buyer conversion | % of loyalty members who purchase a course | CRM purchase webhook matched to viewer profile |
| Loyalty member course activity | Avg modules completed by loyalty members vs non-members | LMS data matched to viewer tier |
| Upsell/renewal rate | % of course buyers who buy a second product | CRM purchase history for viewers with course buyer tag |

### 7.2 Operational Metrics

| Metric | Purpose |
|---|---|
| Points issued vs redeemed (earn-to-burn ratio) | Target 60-75% redemption |
| Tier distribution | % of active viewers in each tier — monitor for healthy pyramid |
| Reward redemption by type | Which rewards popular vs ignored |
| Referral conversion rate | % of referral links -> attendance/purchase |
| Streak distribution | Average streak length, % with 7+/30+/100+ day streaks |
| Segment sizes | Segment counts trending up or down |
| Time to first reward | Average days from signup to first redemption. Target: 3-4 weeks |

### 7.3 Admin Dashboard Views

1. Overview: active viewers, segment counts, tier distribution chart, points economy health
2. Funnel view: conversion funnel Paper Trader -> course buyer, drop-off at each stage
3. Stream analytics: per-stream attendance, engagement, points issued, top earners
4. Reward analytics: redemption rates, most/least popular rewards, cost to business
5. Referral analytics: referral link performance, top referrers, conversion rates

---

## 8. Stream Overlay / Browser Source

Dedicated route: `/overlay/leaderboard/[streamId]`

- Top 10 earners this stream with tier badge icons (color-coded)
- Prestige badges glow/animate visually
- Auto-refreshes every 10-15 seconds via polling or WebSocket
- Compact design fits in stream corner or side panel
- Customizable: position, size, theme (dark/light), number of entries
- Shows: tier badge + username + points earned this stream

---

## 9. Chat Commands

| Command | Who Can Use | Effect |
|---|---|---|
| `!helpful @username` | Any viewer | Gives @username a helpful upvote (5 pts, capped 25/stream) |
| `!goodq @username` | Mods / Streamer | Awards @username 20 pts for a quality question |
| `!points` | Any viewer | Bot replies with viewer's current points and tier |
| `!streak` | Any viewer | Bot replies with viewer's current streak |
| `!leaderboard` | Any viewer | Bot replies with top 5 earners this stream |
| `!refer` | Any viewer | Bot replies with viewer's unique referral link |

---

## 10. Anti-Inflation & Economy Health

### Point Sinks (ways points leave the system)
- Reward redemptions (primary sink)
- 7-day pause costs 500 points
- Point expiration after 90 days of inactivity (any stream attendance resets clock)
- Limited-time flash rewards create urgency to spend

### Velocity Limits
- Max points earnable per stream: ~200 (prevents farming)
- Max `!helpful` upvotes given per viewer per stream: 5
- Max referral bonuses per month: 20
- Chat activity points capped at 15/stream

### Monitoring
- Track earn-to-burn ratio monthly. If below 40% redemption, rewards are too expensive. If above 90%, rewards are too cheap.
- Track tier distribution. If >70% stuck at Paper Trader, earning is too slow or tier thresholds too high.

---

## Design Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Channels | All platforms, YouTube first | Start focused, expand later |
| Primary goal | Community stickiness | Long-term retention over short-term conversion |
| Tier names | Trading career metaphor | On-brand for trading education |
| Points = currency | Direct (no token abstraction) | Simpler for users |
| Pacing | Moderate (3-4 weeks to first reward) | Balance engagement vs value perception |
| Stream frequency | Daily (5-7/week) | High earning opportunity |
| Tier decay | Maintain or decay with pauses | Active but forgiving |
| Prestige tiers | Points + achievement conditions | Multiple dimensions of loyalty |
| Paid gate | Course/cohort buyers only | Ties to core revenue |
| Community contribution | Peer upvotes via `!helpful` | Democratic, measurable, encourages helping |
| Leaderboard | Per-stream with tier badges | Live competition + visual aspiration |
| Rewards | Value-ladder aligned | Funnel tool, not gamification side-game |
