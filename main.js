function populateRankingDates() {

    let $dropdown = $("#date");
    
    let todayDt = new Date(new Date().toDateString()); // Today without time
    let searchDt = new Date (2023, 9 - 1, 6);

    while (searchDt < todayDt) {
        searchDt.setMonth(searchDt.getMonth() + 3); // Add 3 months (a quarter)
        searchDt.setDate(searchDt.getDate() - searchDt.getDay()); // Set to first of month
        searchDt.setDate(searchDt.getDate() + ((3 - searchDt.getDay() + 7) % 7)); // Set to Wednesday = 3

        if (searchDt > todayDt){
            let thisWedDt = new Date(todayDt);
            thisWedDt.setDate(thisWedDt.getDate() + ((3 - thisWedDt.getDay() + 7) % 7)); // Set to Wednesday = 3
            let thisWedStr = getStandardDateString(thisWedDt);
            $dropdown.prepend($("<option />").val(thisWedStr).text(`Current (${thisWedStr})`));
            $dropdown.val(thisWedStr);
        }

        let dtStr = getStandardDateString(searchDt);
        $dropdown.prepend($("<option />").val(dtStr).text(`Q${(searchDt.getMonth() + 1) / 3} ${searchDt.getFullYear()} (${dtStr})`));
        
        if (searchDt == todayDt)
            $dropdown.val(dtStr);
    }
}

function setRegion() {
    var offset = new Date().getTimezoneOffset();
    if ((-6*60) < offset && offset < (3*60))
        $("#region").val("EUR");
}

function teamDetailsModal() {
    var teamChart;
    var teamGameHistoryDt;
    let $teamDetailModal = $('#teamDetailModal');

    $('#mrdaRankingPointsContainer').on('click', 'td.dt-teamDetailsClick', function (e) {
        let tr = e.target.closest('tr');
        let row = $('#mrdaRankingPoints').DataTable().row(tr);
        let team = row.data();

        $('#teamName').text(team.teamName);
        $('#teamAverageRankingPoints').text(team.rankingPoints.toFixed(2));

        teamChart = new Chart(document.getElementById("teamChart"), {
            type: 'lineWithErrorBars',
            data: {
                datasets: [{
                    label: 'Game Ranking Points',
                    data: Array.from(team.gameHistory, (game) => ({ 
                        x: new Date(game.date), 
                        y: game.rankingPoints[team.teamId], 
                        title: getStandardDateString(game.date) + (game.homeTeamId == team.teamId ? 
                            (game.scores[game.homeTeamId] > game.scores[game.awayTeamId] ? " W " : " L ") + " vs. " + mrda_teams[game.awayTeamId].name 
                            : (game.scores[game.awayTeamId] > game.scores[game.homeTeamId] ? " W " : " L ") +  " @ " + mrda_teams[game.homeTeamId].name),
                        label: game.rankingPoints[team.teamId] ? 'Game Ranking Points: ' + game.rankingPoints[team.teamId].toFixed(2) : "" })),                        
                    showLine: false
                }, {
                    label: 'Ranking Points by Linear Regression ± Standard Error',
                    data: Array.from(team.rankingPointsHistory, ([date, rp]) => ({ 
                        x: new Date(date + " 00:00:00"), 
                        y: rp, 
                        yMin: team.stdErrMinHistory.get(date), 
                        yMax: team.stdErrMaxHistory.get(date), 
                        title: date, 
                        label: "Ranking Points: " + rp + " ± " + team.relStdErrHistory.get(date) + "% (" + team.stdErrMinHistory.get(date).toFixed(2) + " .. " + team.stdErrMaxHistory.get(date).toFixed(2) + ")"})),
                    showLine: true
                }],
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                        min: new Date(team.rankingPointsHistory.keys().next().value + " 00:00:00"),
                        max: new Date([...team.rankingPointsHistory][team.rankingPointsHistory.size-1][0] + " 00:00:00")
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return context[0].raw.title;
                            },
                            label: function(context) {
                                return context.raw.label;
                            }
                        }
                    }
                }
            }
        });

        teamGameHistoryDt = new DataTable('#teamGameHistory', {
            columns: [
                { name: 'date', data: 'date'},
                { data: 'score' },
                { data: 'expectedRatio'},
                { data: 'actualRatio'},
                { data: 'beforeRankingPoints', className: 'border-left'},
                { data: 'afterRankingPoints'}                
            ],
            data: Array.from(team.gameHistory, (game) => ({ 
                date: getStandardDateString(game.date),
                score: game.scores[team.teamId] + "-" + (game.homeTeamId == team.teamId ? 
                    game.scores[game.awayTeamId] + (game.scores[game.homeTeamId] > game.scores[game.awayTeamId] ? " W " : " L ") + " vs. " + mrda_teams[game.awayTeamId].name 
                    : game.scores[game.homeTeamId] + (game.scores[game.awayTeamId] > game.scores[game.homeTeamId] ? " W " : " L ") + " @ " + mrda_teams[game.homeTeamId].name),
                expectedRatio: team.teamId in game.expectedRatios ? game.expectedRatios[team.teamId].toFixed(2) : "",
                actualRatio: !game.forfeit ? (game.scores[team.teamId]/(game.homeTeamId == team.teamId ? game.scores[game.awayTeamId] : game.scores[game.homeTeamId])).toFixed(2) : "",
                beforeRankingPoints: team.getRankingPointHistoryWithError(game.date) ?? "",
                afterRankingPoints: team.getRankingPointHistoryWithError(game.date, true) ?? ""
            })),
            lengthChange: false,
            searching: false,
            info: false,
            order: {
                name: 'date',
                dir: 'desc'
            },
            ordering: {
                handler: false
            },
        });

        $teamDetailModal.modal('show');
    });

    $teamDetailModal.on('hidden.bs.modal', function (event) {
        $('#teamName').text('');
        $('#teamAverageRankingPoints').text('');
        teamChart.destroy();
        teamGameHistoryDt.clear();
        teamGameHistoryDt.destroy();
    });

}

function displayRankingChart(teamsArray, calcDate) {

    let calcDt = new Date(calcDate + " 00:00:00");
    let minDt = new Date(calcDt);
    minDt.setDate(calcDt.getDate() - 7 * 52);
        // If minDt is a greater # weekday of month than calcDt, set minDt back an additional week
        // e.g. if calcDt is 1st Wednesday of June, minDt should be 1st Wednesday of June last year.
        // calcDt = Jun 7, 2028, 52 weeks prior would minDt = Jun 9, 2027 which is 2nd Wednesday of June.
        // set minDt back an additional week minDt = Jun 2, 2027 so games on weekend of Jun 4-6, 2027 count
        if (Math.floor((minDt.getDate() - 1) / 7) > Math.floor((calcDt.getDate() - 1) / 7))
            minDt.setDate(minDt.getDate() - 7);
        
    let datasets = [];

    teamsArray.sort((a, b) => a.rankSort - b.rankSort).forEach(team => {
        if (team.chart) {
            datasets.push({
                label: team.teamName,
                data: Array.from(team.rankingPointsHistory, ([date, rp]) => ({ x: new Date(date + " 00:00:00"), y: rp, teamName: team.teamName })),
                showLine: true
            });
        }
    });

    let rankingChart = Chart.getChart("rankingsChart");
    if (rankingChart != undefined) {
        rankingChart.destroy();
    }

    rankingChart = new Chart(document.getElementById("rankingsChart"), {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                        min: minDt,
                        max: calcDt
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return context[0].raw.teamName;
                            },
                            label: function(context) {
                                return getStandardDateString(context.raw.x) + ": " + context.raw.y.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
}

function averageFromArray(array) {
    var total = 0;
    for(var i = 0; i < array.length; i++) {
        total += array[i];
    }
    return total / array.length;
}

function meanAbsoluteLogErrorPercent(absLogErrorArray) {
    let meal = averageFromArray(absLogErrorArray);
    let errorPct = (Math.exp(meal) - 1) * 100;
    return errorPct.toFixed(2) + '%';
}

function calculateAndDisplayRankings() {

    let calcDate = $("#date").val();

    let region = $("#region").val()

    let mrdaLinearRegressionSystem = new MrdaLinearRegressionSystem(mrda_teams);

    mrdaLinearRegressionSystem.updateRankings(rankings_history, calcDate);

    mrdaLinearRegressionSystem.addGameHistory(mrda_games, calcDate);

    mrdaLinearRegressionSystem.rankTeams(region);

    if (mrdaLinearRegressionSystem.absoluteLogErrors.length > 0)
    {
        let $pctErrorDiv = $('#pctErrorMeal');
        $pctErrorDiv.html("Percent Error using Mean Absolute Log Error: <br />");
        if (mrdaLinearRegressionSystem.absoluteLogErrors_2025_Q1.length > 0)
            $pctErrorDiv.append("2025 Q1: " + meanAbsoluteLogErrorPercent(mrdaLinearRegressionSystem.absoluteLogErrors_2025_Q1) + "<br />");
        if (mrdaLinearRegressionSystem.absoluteLogErrors_2025_Q2.length > 0)
            $pctErrorDiv.append("2025 Q2: " + meanAbsoluteLogErrorPercent(mrdaLinearRegressionSystem.absoluteLogErrors_2025_Q2) + "<br />");
        if (mrdaLinearRegressionSystem.absoluteLogErrors_2025_Q3.length > 0)
            $pctErrorDiv.append("2025 Q3: " + meanAbsoluteLogErrorPercent(mrdaLinearRegressionSystem.absoluteLogErrors_2025_Q3) + "<br />");
        if (mrdaLinearRegressionSystem.absoluteLogErrors_2025_Q4.length > 0)
            $pctErrorDiv.append("2025 Q4: " + meanAbsoluteLogErrorPercent(mrdaLinearRegressionSystem.absoluteLogErrors_2025_Q4) + "<br />");        
        $pctErrorDiv.append("Total: " + meanAbsoluteLogErrorPercent(mrdaLinearRegressionSystem.absoluteLogErrors));
    }

    displayRankingChart(Object.values(mrdaLinearRegressionSystem.mrdaTeams), calcDate);

    let regenerate = DataTable.isDataTable('#mrdaRankingPoints');

    if (regenerate)
        $('#mrdaRankingPoints').DataTable().clear().destroy();        

    new DataTable('#mrdaRankingPoints', {
        columns: [
            { name: 'rankSort', data: 'rankSort', visible: false},
            { title: 'Rank', data: 'rank', className: 'dt-teamDetailsClick', orderData: [0,1] },
            { title: 'Team', data: 'teamName', className: 'dt-teamDetailsClick', render: function (data, type, full) { return data + (full.rank && full.forfeits > 0 ? "<sup class='forfeitPenalty'>*</sup>" : ""); } },
            { title: 'Ranking Points', data: 'rankingPoints', className: 'dt-teamDetailsClick' },
            { title: 'Error', data: 'relStdErr', render: function (data, type, full) { return "± " + data + "%"; }, className: 'dt-teamDetailsClick relStdErr' },
            { title: 'Games Count',  data: 'activeStatusGameCount', className: 'dt-teamDetailsClick'},
            { title: 'Postseason Eligible', data: 'postseasonEligible', render: function (data, type, full) { return data ? 'Yes' : 'No'; }, className: 'dt-teamDetailsClick'},
            { title: "Chart", data: 'chart', orderable: false, render: function (data, type, full) { return "<input type='checkbox' class='chart' " + (data ? "checked" : "") + "></input>"; }}
        ],
        data: Object.values(mrdaLinearRegressionSystem.mrdaTeams).filter(team => team.activeStatusGameCount > 0 && (team.region == region || region == "GUR")),
        paging: false,
        searching: false,
        info: false,
        order: {
            name: 'rankSort',
            dir: 'asc'
        }
    });

    $("sup.forfeitPenalty").tooltip({title: "Two rank penalty applied for each forfeit."});

    $("th.relStdErr").tooltip({title: "Relative Standard Error"});
    $("th.relStdErr .dt-column-title").append(' <i class="bi bi-question-circle"></i>');
    
    if (!regenerate) {
        $("#mrdaRankingPointsContainer").on('change', 'input.chart', function (e) {
            let tr = e.target.closest('tr');
            let dt = $('#mrdaRankingPoints').DataTable();
            let row = dt.row(tr);
            let team = row.data();
            team.chart = $(this).prop('checked');
            displayRankingChart(dt.rows().data().toArray(), $("#date").val());
        });
    }
}

function setupApiGames() {
    new DataTable('#apiGames', {
            columns: [
                { title: "Date", name: 'date', data: 'date', render: getStandardDateString },
                { title: "Home Team", data: 'home_team_id', render: function(data, type, full) { return mrda_teams[data].name } },
                { title: "Home Score", data: 'home_team_score', render: function(data, type, full) { return data + (full.forfeit ? "*" : ""); }},
                { title: "Away Score", data: 'away_team_score', render: function(data, type, full) { return data + (full.forfeit ? "*" : ""); }} ,
                { title: "Away Team", data: 'away_team_id', render: function(data, type, full) { return mrda_teams[data].name } },
                { title: "Event Name", data: 'event_name'},
                { title: "Type", render: function (data, type, full) { return full.championship ? "Championship" : full.qualifier ? "Qualifier" : "Regular Season"; }},
                { title: "Validated", data: 'status', render: function(data, type, full) { return data  == 7 }} ,
            ],
            data: mrda_games,
            lengthChange: false,
            order: {
                name: 'date',
                dir: 'desc'
            }
        });
}

async function setupUpcomingGames() {

    let payload = null;
    try {
        let apiUrl = 'https://api.mrda.org/v1-public/sanctioning/scores?limit=100'

        let today = new Date();
        apiUrl += `&start-date=${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
        apiUrl += `&end-date=${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear() + 1}`;

        let response = await fetch(apiUrl);

        let data = await response.json();

        if (data.success != true || !data.payload || !Array.isArray(data.payload)) 
            throw new Error('Invalid data format received');

        payload = data.payload;
    } catch (error) {
        console.error('Error fetching games data:', error);
    }

    let upcomingGames = payload.map(function(game) {
        let homeTeamId = game.event.home_league + (game.event.home_league_charter == 'primary' ? 'a' : 'b');
        let awayTeamId = game.event.away_league + (game.event.away_league_charter == 'primary' ? 'a' : 'b');

        let rankingHistoryDate = Object.keys(rankings_history)
            .filter(date => new Date(date + " 00:00:00") <= new Date(game.event.game_datetime))
            .sort((a, b) => new Date(b) - new Date(a))[0];

        let homeRp = rankingHistoryDate && rankings_history[rankingHistoryDate] && rankings_history[rankingHistoryDate][homeTeamId] ? rankings_history[rankingHistoryDate][homeTeamId].rp : null;
        let awayRp = rankingHistoryDate && rankings_history[rankingHistoryDate] && rankings_history[rankingHistoryDate][awayTeamId] ? rankings_history[rankingHistoryDate][awayTeamId].rp : null;

        let expectedRatio = homeRp && awayRp ? (homeRp > awayRp ? homeRp / awayRp : awayRp / homeRp) : null;

        return {
            date: game.event.game_datetime,
            home_team_id: homeTeamId,
            home_team_rp: homeRp,
            away_team_id: awayTeamId,
            away_team_rp: awayRp,
            expected_ratio: expectedRatio ? expectedRatio.toFixed(2) : null,
            event_name: game.sanctioning.event_name
        }
    });


    new DataTable('#upcomingGames', {
            columns: [
                { title: "Date", name: 'date', data: 'date', render: getStandardDateString},
                { title: "Home Team, Ranking Points", className: 'dt-right', data: 'home_team_id', render: function(data, type, full) {return mrda_teams[data].name + ", " + full.home_team_rp }  },
                { title: "Predicted Ratio", className: 'dt-center', data: 'expected_ratio', render: function(data, type, full) { return data ? (full.home_team_rp > full.away_team_rp ? data + " : 1" : "1 : " + data) : "" } },
                { title: "Away Team, Ranking Points", data: 'away_team_id', render: function(data, type, full) {return mrda_teams[data].name + ", " + full.away_team_rp }  },
                { title: "Event Name", data: 'event_name'}
            ],
            data: upcomingGames,
            lengthChange: false,
            order: {
                name: 'date',
                dir: 'asc'
            }
        });
}

function calculatePredictedRatio() {
    let gameDate = $('#gameDate')[0].valueAsDate;
    let homeTeamId = $('#homeTeam').val();
    let awayTeamId = $('#awayTeam').val();

    let rankingHistoryDate = Object.keys(rankings_history)
        .filter(date => new Date(date + " 00:00:00") <= gameDate)
        .sort((a, b) => new Date(b) - new Date(a))[0];

    let homeRp = rankingHistoryDate && rankings_history[rankingHistoryDate] && rankings_history[rankingHistoryDate][homeTeamId] ? rankings_history[rankingHistoryDate][homeTeamId].rp : null;
    let awayRp = rankingHistoryDate && rankings_history[rankingHistoryDate] && rankings_history[rankingHistoryDate][awayTeamId] ? rankings_history[rankingHistoryDate][awayTeamId].rp : null;        
    let expectedRatio = homeRp && awayRp ? (homeRp > awayRp ? homeRp / awayRp : awayRp / homeRp).toFixed(2) : null;

    $('#homeRankingPoints').text(homeRp);        
    $('#awayRankingPoints').text(awayRp);
    $('#expectedScoreRatio').text( expectedRatio ? (homeRp > awayRp ? expectedRatio + " : 1" : "1 : " + expectedRatio) : null);        
}

function setupPredictedRatioCalc() {
    $('#gameDate')[0].valueAsDate = new Date();
    
    Object.entries(mrda_teams).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([teamId, teamVal]) => {
        $('#homeTeam').append($("<option />").val(teamId).text(teamVal.name));
        $('#awayTeam').append($("<option />").val(teamId).text(teamVal.name));
    });

    $('#homeTeam').change(calculatePredictedRatio);
    $('#awayTeam').change(calculatePredictedRatio);
    $('#gameDate').change(calculatePredictedRatio);
}

async function main() {

    //document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    populateRankingDates();

    setRegion();

    calculateAndDisplayRankings();

    teamDetailsModal();

    setupApiGames();

    setupUpcomingGames();

    setupPredictedRatioCalc();

    $('#rankingsGeneratedDt').text(new Date(rankings_generated_utc));
    
    $("#date").on( "change", calculateAndDisplayRankings );
    $("#region").on( "change", calculateAndDisplayRankings );
}

window.addEventListener('load', main);