const REGIONS = ['EUR', 'AA', 'AM'];
const RATIO_CAP = 4;

function ratioCapped(homeScore,awayScore) {
    homeScore = Math.max(homeScore, 0.1);
    awayScore = Math.max(awayScore, 0.1);       
    return Math.max(Math.min(homeScore/awayScore,RATIO_CAP),1/RATIO_CAP);
}

function getStandardDateString(dt) {
    if (!(dt instanceof Date))
        dt = new Date(dt);
    return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
}

class MrdaGame {
    constructor(game) {
        this.date = game.date instanceof Date ? game.date : new Date(game.date);
        this.homeTeamId = game.home_team_id;
        this.awayTeamId = game.away_team_id;
        this.scores = {};
        this.scores[this.homeTeamId] = game.home_team_score;
        this.scores[this.awayTeamId] = game.away_team_score;
        this.forfeit = game.forfeit;
        this.forfeitTeamId = game.forfeit_team_id;
        this.eventId = game.event_id;
        this.status = game.status;
        this.weight = game.weight;
        this.expectedRatios = {};
        this.gamePoints = {};
    }

    getGameSummary(teamId, allTeams) {
        let opponentId = null
        let vsOrAt = null;
        
        if (teamId == this.homeTeamId) {
            opponentId = this.awayTeamId;
            vsOrAt = "vs.";
        } else {
            opponentId = this.homeTeamId;
            vsOrAt = "@";
        }

        let wOrL = this.scores[teamId] > this.scores[opponentId] ? "W" : "L";

        return `${this.scores[teamId]}-${this.scores[opponentId]} ${wOrL} ${vsOrAt} ${allTeams[opponentId].name}`;
    }
}

class MrdaEvent {
    constructor(eventId, event) {
        this.eventId = eventId;
        this.startDt = new Date(event.start_day + " 00:00:00");
        this.endDt = event.startDay != event.endDay ? new Date(event.endDay + " 00:00:00") : this.startDt;
        this.name = event.name;
    }

    getDateString() {
        // Single day events
        if (this.startDt == this.endDt){
            // If the single day event has a title, return the date but don't include the weekday for brevity
            if (this.name)
                return this.startDt.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
            else
                return this.startDt.toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});
        } else {
        // Multi-day events use short month for brevity
            let dtFmtOpts = {year:"numeric",month:"short",day:"numeric"};
            let dateStr = this.startDt.toLocaleDateString(undefined,dtFmtOpts);            
            if (this.startDt.getFullYear() != this.endDt.getFullYear())
                return `${dateStr} - ${this.endDt.toLocaleDateString(undefined,dtFmtOpts)}`;
            else if (this.startDt.getMonth() != this.endDt.getMonth()) {
                dtFmtOpts = {month:"short",day:"numeric"};
                let monthAndDay = this.startDt.toLocaleDateString(undefined,dtFmtOpts);
                return dateStr.replace(monthAndDay, `${monthAndDay} - ${endDt.toLocaleDateString(undefined,dtFmtOpts)}`);
            } else {
                dtFmtOpts = {day:"numeric"};
                let day = this.startDt.toLocaleDateString(undefined,dtFmtOpts);
                return dateStr.replace(new RegExp(`\\b${day}\\b`, "g"), `${day}-${endDt.toLocaleDateString(undefined,dtFmtOpts)}`);
            }
        }
    }

    getEventTitle() {
        // Single day events
        if (this.startDt == this.endDt) {
            if (this.name)
                return `${this.getDateString()}: ${this.name}`;
            else
                return this.getDateString();
        } else {
        // Multi-day events
            if (this.name)
                return this.name;
            else 
                return this.getDateString();
        }
    }

    getEventTitleWithDate() {
        if (this.name){
            let niceName = this.name.replace("Mens Roller Derby Association", "MRDA")
                                .replace("Men's Roller Derby Association", "MRDA")
                                .replace(this.startDt.getFullYear(),"").trim();
            return `${this.getDateString()}: ${niceName}`;
        } else
            return this.getDateString();
    }
}

class MrdaTeam {
    constructor(teamId, team) {
        this.teamId = teamId;
        this.name = team.name;
        this.region = team.region;
        this.location = team.location;
        this.logo = team.logo && team.logo.startsWith("/central/") ? "https://assets.mrda.org" + team.logo : team.logo;
        this.games = []
        this.gameHistory = []
        this.activeStatus = false;
        this.postseasonEligible = false;
        this.activeStatusGameCount = 0;
        this.wins = 0;
        this.losses = 0;
        this.forfeits = 0;
        this.rankingPoints = 0;
        this.relStdErr = 0;
        this.rankingHistory = new Map();
        this.rankingPointsHistory = new Map();
        this.stdErrMinHistory = new Map();
        this.stdErrMaxHistory = new Map();
        this.relStdErrHistory = new Map();
        this.rank = null;
        this.regionRank = null;        
        this.postseasonPosition = null;
        this.chart = false;
    }

    getRankingPoints(date, addWeek=false) {
        if (!(date instanceof Date))
            date = new Date(date);

        if (addWeek)
            date.setDate(date.getDate() + 7);

        let latestRankingDt = [...this.rankingHistory.keys()].filter(dt => dt <= date)
            .sort((a, b) => b - a)[0];

        if (latestRankingDt)
            return this.rankingHistory.get(latestRankingDt).rankingPoints;
        else
            return null;
    }

    getRankingPointHistory(date, addWeek=false) {
        if (this.rankingPointsHistory.size === 0)
            return;

        // Start search from most recent Wednesday on or before date
        let searchDate = new Date(date);
        searchDate.setDate(searchDate.getDate() - ((searchDate.getDay() - 3 + 7) % 7));

        if (addWeek)
            searchDate.setDate(searchDate.getDate() + 7);

        let oldest = new Date(this.rankingPointsHistory.keys().next().value + " 00:00:00");

        if (isNaN(oldest) || searchDate < oldest)
            return;

        while(!this.rankingPointsHistory.has(getStandardDateString(searchDate)) ) {
            searchDate.setDate(searchDate.getDate() - 7);
        }
        return this.rankingPointsHistory.get(getStandardDateString(searchDate))
    }
}

class MrdaTeamRanking {
    constructor(date, teamId, teamRanking={}) {
        this.date = date;
        this.teamId = teamId;
        this.rankingPoints = teamRanking.rp ?? null;
        this.standardError = teamRanking.se ?? null;        
        this.relativeStandardError = teamRanking.rse ?? null;
        this.gameCount = teamRanking.gc ?? 0;
        this.activeStatus = teamRanking.as ?? false;
        this.postseasonEligible = teamRanking.pe ?? false;
        this.wins = teamRanking.w ?? 0;
        this.losses = teamRanking.l ?? 0;
        this.forfeits = teamRanking.f ?? 0;
    }
}

class MrdaLinearRegressionSystem {
    constructor(mrda_rankings_history_json, mrda_teams_json, mrda_events_json, mrda_games_json) {
        this.mrdaRankingsHistory = new Map();
        this.mrdaTeams = {};
        this.mrdaEvents = {};
        this.mrdaGames = [];

        //this.rankingPeriodDeadlineDt = null;
        //this.rankingPeriodStartDt = null;
        //this.region = region;

        // Build mrdaRankingsHistoryDts map 
        for (const dt of Object.keys(mrda_rankings_history_json).map(day => new Date(day + " 00:00:00")).sort((a, b) => a - b)) {
            let jsonRanking = mrda_rankings_history_json[`${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`];
            let teamRankings = {};
            for (const teamId of Object.keys(jsonRanking))
                teamRankings[teamId] = new MrdaTeamRanking(dt, teamId, jsonRanking[teamId]);
            this.mrdaRankingsHistory.set(dt, teamRankings);
        };
        
        // Map all teams, events and games from raw JSON generated by python
        Object.keys(mrda_teams_json).forEach(teamId => this.mrdaTeams[teamId] = new MrdaTeam(teamId, mrda_teams_json[teamId]));
        Object.keys(mrda_events_json).forEach(eventId => this.mrdaEvents[eventId] = new MrdaEvent(eventId, mrda_events_json[eventId]));
        this.mrdaGames = mrda_games_json.map(game => new MrdaGame(game));

        this.setupTeamRankingHistories();
        this.setupGameHistories();
    }

    setupTeamRankingHistories() {
        let lastRankings = {};
        for (const [date, rankings] of this.mrdaRankingsHistory) {
            for (const [teamId, team] of Object.entries(this.mrdaTeams)) {
                if (teamId in rankings) {
                    // Add teamRanking if they are in current ranking and not in last ranking or something changed.
                    if (!(teamId in lastRankings)
                        || rankings[teamId].rankingPoints != lastRankings[teamId].rankingPoints
                        || rankings[teamId].standardError != lastRankings[teamId].standardError
                        || rankings[teamId].relativeStandardError != lastRankings[teamId].relativeStandardError)
                        team.rankingHistory.set(date,rankings[teamId])                  
                } else if (teamId in lastRankings) {
                    // Add empty teamRanking if they're not in current ranking but were in the last ranking.
                    team.rankingHistory.set(date,new MrdaTeamRanking(date, teamId))
                }
            }
            lastRankings = rankings;
        }
    }

    setupGameHistories() {
        for (const mrdaGame of this.mrdaGames) {
            let homeTeam = this.mrdaTeams[mrdaGame.homeTeamId];
            let awayTeam = this.mrdaTeams[mrdaGame.awayTeamId];
            let homeRankingPoints = homeTeam.getRankingPoints(mrdaGame.date);
            let awayRankingPoints = awayTeam.getRankingPoints(mrdaGame.date);
            
            if (!mrdaGame.forfeit) {
                let homeScoreRatio = ratioCapped(mrdaGame.scores[mrdaGame.homeTeamId],mrdaGame.scores[mrdaGame.awayTeamId]);
                let awayScoreRato = ratioCapped(mrdaGame.scores[mrdaGame.awayTeamId],mrdaGame.scores[mrdaGame.homeTeamId]);

                if (homeRankingPoints && awayRankingPoints) {
                    mrdaGame.expectedRatios[mrdaGame.homeTeamId] = homeRankingPoints/awayRankingPoints;
                    mrdaGame.expectedRatios[mrdaGame.awayTeamId] = awayRankingPoints/homeRankingPoints;
                    mrdaGame.gamePoints[mrdaGame.homeTeamId] = homeRankingPoints * homeScoreRatio/ratioCapped(homeRankingPoints,awayRankingPoints);
                    mrdaGame.gamePoints[mrdaGame.awayTeamId] = awayRankingPoints * awayScoreRato/ratioCapped(awayRankingPoints,homeRankingPoints);
                } else if (homeScoreRatio < RATIO_CAP && awayScoreRato < RATIO_CAP) {
                    // Calculate game points for new team as seeding games for visualization
                    let newTeamId = homeRankingPoints ? mrdaGame.awayTeamId : mrdaGame.homeTeamId;
                    let establishedTeamId = homeRankingPoints ? mrdaGame.homeTeamId : mrdaGame.awayTeamId;
                    let establishedTeamRp = homeRankingPoints ? homeRankingPoints : awayRankingPoints;
                    mrdaGame.gamePoints[newTeamId] = establishedTeamRp * mrdaGame.scores[newTeamId]/mrdaGame.scores[establishedTeamId];
                }
            }
            
            homeTeam.gameHistory.push(mrdaGame);
            awayTeam.gameHistory.push(mrdaGame);
        }
    }

    rankTeams(date, region) {
        // Get most recent Ranking History and apply to all teams
        let latestRankingDt = [...this.mrdaRankingsHistory.keys()].filter(dt => dt <= date).sort((a,b) => b - a)[0];
        let ranking = this.mrdaRankingsHistory.get(latestRankingDt);
        for (const [teamId, team] of Object.entries(this.mrdaTeams)) {
            if (teamId in ranking) {
                let teamRanking = ranking[team.teamId];
                team.rankingPoints = teamRanking.rankingPoints;
                team.relStdErr = teamRanking.relativeStandardError;
                team.activeStatusGameCount = teamRanking.gameCount;                
                team.activeStatus = teamRanking.activeStatus;
                team.postseasonEligible = teamRanking.postseasonEligible;
                team.wins = teamRanking.wins;
                team.losses = teamRanking.losses;
                team.forfeits = teamRanking.forfeits;
            } else {
                team.rankingPoints = null;
                team.relStdErr = null;
                team.activeStatusGameCount = 0;                
                team.activeStatus = false;
                team.postseasonEligible = false;
                team.wins = 0;
                team.losses = 0;
                team.forfeits = 0;
            }
        }

        // Rank the active teams
        let sortedActiveTeams = Object.values(this.mrdaTeams).filter(team => team.activeStatus)
                                    .sort((a, b) => b.rankingPoints - a.rankingPoints );

        for (let i = 0; i < sortedActiveTeams.length; i++) {
            let team = sortedActiveTeams[i];
            team.rank = i + 1;

            if (region == "GUR" && team.rank <= 5)
                team.chart = true;
        }

        let forfeitAsterisk = $('#forfeitAsterisk');
        forfeitAsterisk.hide();
        // Handle forfeits and 2 ranking spot penalty
        Object.values(this.mrdaTeams).filter(team => team.activeStatus && team.forfeits > 0).forEach(team => {
            // Each forfeit gets penalty
            for (let i = 0; i < team.forfeits; i++) {
                // Try to swap with next team twice
                for (let j = 0; j < 2; j++) {
                    let swapTeam = Object.values(this.mrdaTeams).find(t => t.rank == (team.rank + 1));
                    if (swapTeam) {
                        swapTeam.rank -= 1;
                        team.rank += 1;
                        if (team.region == region)
                            forfeitAsterisk.show();
                    }
                }
            }
        });

        // Rank inactive teams for sorting, rank is hidden
        let sortedInactiveTeams = Object.values(this.mrdaTeams).filter(team => !team.activeStatus)
                                                        .sort((a, b) => b.rankingPoints - a.rankingPoints );

        for (let i = 0; i < sortedInactiveTeams.length; i++) {
            let team = sortedInactiveTeams[i];
            team.rank = sortedActiveTeams.length + i + 1;
        }

        // Set regionRank if a region is selected
        if (region != "GUR") {
            let regionSortedRankedTeams = Object.values(this.mrdaTeams).filter(team => team.activeStatus && team.region == region)
                                                        .sort((a, b) => a.rank - b.rank);
            for (let i = 0; i < regionSortedRankedTeams.length; i++) {
                let team = regionSortedRankedTeams[i];
                team.regionRank = i + 1;

                if (team.regionRank <= 5)
                    team.chart = true;
            }
        }

        // Assign potential postseason invite positions
        // Champs go to top 7 globally
        let sortedPostseasonTeams = Object.values(this.mrdaTeams).filter(team => team.postseasonEligible)
                                                .sort((a, b) => a.rank - b.rank );
        for (let i = 0; i < 7; i++) {
            let team = sortedPostseasonTeams[i];
            team.postseasonPosition = "GUR";
        }

        // Regional Qualifiers
        REGIONS.forEach(r => {
            let qualInfo = $("#postseasonLegend .postseasonPosition-" + r + " .qualifiers");
            let inviteInfo = $("#postseasonLegend .postseasonPosition-" + r + " .invites");

            // Austrasia gets 1 spot, other regions get 2
            let spots = r == "AA" ? 1 : 2;

            let regionPostseasonTeams = Object.values(this.mrdaTeams).filter(team => team.postseasonEligible && r == team.region && team.postseasonPosition == null)
                                            .sort((a, b) => a.rank - b.rank );

            // Handle fewer postseason eligible teams in this region than spots
            if (regionPostseasonTeams <= spots){
                qualInfo.hide();
                inviteInfo.show();

                //assign the regions spots to next best eligible team in region, or next best eligible team globally.
                for (let i = 0; i < spots; i++) {
                    let team = regionPostseasonTeams[i];
                    if (team) {
                        team.postseasonPosition = r;
                    } else {
                        let globalPostseasonTeams = Object.values(this.mrdaTeams).filter(team => team.postseasonEligible && team.postseasonPosition == null)
                                                                            .sort((a, b) => a.rank - b.rank );
                        team = globalPostseasonTeams[0];
                        if (team)
                            team.postseasonPosition = r;
                    }
                }
            } else {
                qualInfo.show();
                inviteInfo.hide();
                // Assign qualifier spots up to 8
                for (let i = 0; i < Math.min(8,regionPostseasonTeams.length); i++) {
                    let team = regionPostseasonTeams[i];
                    team.postseasonPosition = r;
                }
            }
        });
    }
}
