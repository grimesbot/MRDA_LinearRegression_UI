let rankingPeriodDeadlineDt = null;
let rankingPeriodStartDt = null;
function setRankingDates() {
    rankingPeriodDeadlineDt = new Date($("#date").val() + " 00:00:00");
    rankingPeriodStartDt = new Date(rankingPeriodDeadlineDt);
    rankingPeriodStartDt.setDate(rankingPeriodDeadlineDt.getDate() - 7 * 52);
        // If rankingPeriodStartDt is a greater # weekday of month than rankingPeriodDeadlineDt, set rankingPeriodStartDt back an additional week
        // e.g. if rankingPeriodDeadlineDt is 1st Wednesday of June, rankingPeriodStartDt should be 1st Wednesday of June last year.
        // rankingPeriodDeadlineDt = Jun 7, 2028, 52 weeks prior would rankingPeriodStartDt = Jun 9, 2027 which is 2nd Wednesday of June.
        // set rankingPeriodStartDt back an additional week rankingPeriodStartDt = Jun 2, 2027 so games on weekend of Jun 4-6, 2027 count
        if (Math.floor((rankingPeriodStartDt.getDate() - 1) / 7) > Math.floor((rankingPeriodDeadlineDt.getDate() - 1) / 7))
            rankingPeriodStartDt.setDate(rankingPeriodStartDt.getDate() - 7);
}

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
            $dropdown.prepend($("<option />").val(thisWedStr).text('Today'));
            $dropdown.val(thisWedStr);
        }

        let dtStr = getStandardDateString(searchDt);
        $dropdown.prepend($("<option />").val(dtStr).text(`Q${(searchDt.getMonth() + 1) / 3} ${searchDt.getFullYear()}`));
        
        if (searchDt == todayDt)
            $dropdown.val(dtStr);
    }

    setRankingDates();
}

function setRegion() {
    var offset = new Date().getTimezoneOffset();
    if ((-6*60) < offset && offset < (3*60))
        $("#region").val("EUR");
    else
        $("#region").val("AM");
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

        if (team.logo)
            $('#teamLogo').attr('src', team.logo).show();
        else
            $('#teamLogo').hide();

        if (team.location)
            $('#teamLocation').text(team.location).show();
        else
            $('#teamLocation').hide();

        teamChart = new Chart(document.getElementById("teamChart"), {
            type: 'lineWithErrorBars',
            data: {
                datasets: [{
                    label: 'Game Ranking Points (2023 Algorithm)',
                    data: Array.from(team.gameHistory, (game) => ({ 
                        x: new Date(game.date), 
                        y: game.rankingPoints[team.teamId], 
                        title: getStandardDateString(game.date) + (game.homeTeamId == team.teamId ? 
                            (game.scores[game.homeTeamId] > game.scores[game.awayTeamId] ? " W " : " L ") + " vs. " + mrda_teams[game.awayTeamId].name 
                            : (game.scores[game.awayTeamId] > game.scores[game.homeTeamId] ? " W " : " L ") +  " @ " + mrda_teams[game.homeTeamId].name),
                        label: game.rankingPoints[team.teamId] ? 'Game Ranking Points: ' + game.rankingPoints[team.teamId].toFixed(2) : "" })),                        
                    showLine: false
                }, {
                    label: 'Ranking Points ± Standard Error',
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
                },
                responsive: true,
                maintainAspectRatio: false
            }
        });

        teamGameHistoryDt = new DataTable('#teamGameHistory', {
            columns: [
                { name: 'date', data: 'date'},
                { data: 'score', className: 'text-overflow-ellipsis' },
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
                beforeRankingPoints: team.getRankingPointHistory(game.date) ?? "",
                afterRankingPoints: team.getRankingPointHistory(game.date, true) ?? ""
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

function displayRankingChart(teamsArray) {
        
    let datasets = [];

    teamsArray.sort((a, b) => a.rank - b.rank).forEach(team => {
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
                        min: rankingPeriodStartDt,
                        max: rankingPeriodDeadlineDt
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
                },
                responsive: true,
                maintainAspectRatio: false
            }
        });
}

function calculateAndDisplayRankings() {

    let mrdaLinearRegressionSystem = new MrdaLinearRegressionSystem(mrda_teams, rankingPeriodDeadlineDt, rankingPeriodStartDt, $("#region").val());

    mrdaLinearRegressionSystem.updateRankings(rankings_history);

    mrdaLinearRegressionSystem.addGameHistory(mrda_games);

    mrdaLinearRegressionSystem.rankTeams();

    displayRankingChart(Object.values(mrdaLinearRegressionSystem.mrdaTeams));

    let regenerate = DataTable.isDataTable('#mrdaRankingPoints');

    if (regenerate)
        $('#mrdaRankingPoints').DataTable().clear().destroy();        

    new DataTable('#mrdaRankingPoints', {
        columns: [
            { name: 'rankSort', data: 'rank', visible: false},
            { data: 'rank', width: '1em', className: 'dt-teamDetailsClick', render: function (data, type, full) { return full.activeStatus ? (mrdaLinearRegressionSystem.region == "GUR" ? data : full.regionRank) : ""; }, orderData: [0,1] },
            { data: 'logo', orderable: false, className: 'dt-teamDetailsClick teamLogo', render: function (data, type, full) { return data ? "<img height='40' src='" + data + "'>" : ""; } },            
            { data: 'teamName', orderable: false, className: 'dt-teamDetailsClick teamName', 
                createdCell: function (td, cellData, rowData, row, col) {
                    let $td = $(td);
                    if (rowData.activeStatus && rowData.forfeits > 0)
                        $td.append("<sup class='forfeitPenalty'>↓</sup>");
                    if (rowData.location) {
                        $td.append("<div class='teamLocation'>" + rowData.location + "</div>");
                    }
                }},
            { data: 'rankingPoints', className: 'dt-teamDetailsClick' },
            { data: 'relStdErr', className: 'dt-teamDetailsClick relStdErr', createdCell: function (td, cellData, rowData, row, col) { $(td).prepend("±").append("%"); }},
            { data: 'activeStatusGameCount', className: 'dt-teamDetailsClick', createdCell: function (td, data, rowData) { if (!rowData.postseasonEligible) $(td).append("<span class='postseasonIneligible'>*</span>"); } },
            { data: 'wins', orderable: false, className: 'dt-teamDetailsClick'},
            { data: 'losses', orderable: false, className: 'dt-teamDetailsClick'},
            { data: 'chart', orderable: false, render: function (data, type, full) { return "<input type='checkbox' class='chart' " + (data ? "checked" : "") + "></input>"; }}
        ],
        data: Object.values(mrdaLinearRegressionSystem.mrdaTeams).filter(team => (team.wins + team.losses) > 0 && (team.region == mrdaLinearRegressionSystem.region || mrdaLinearRegressionSystem.region == "GUR")),
        dom: 't',
        paging: false,
        searching: false,
        info: false,
        order: {
            name: 'rankSort',
            dir: 'asc'
        },
        fixedHeader: {
            header: true,
            headerOffset: $("nav.sticky-top").outerHeight()
        },
        //responsive: true,
        createdRow: function (row, data, dataIndex) {
            if (data.postseasonPosition != null) {
                $(row).addClass('postseasonPosition-' + data.postseasonPosition);
            }
        }
    });

    $(".forfeitPenalty").tooltip({title: "Two rank penalty applied for each forfeit."});
    $(".postseasonIneligible").tooltip({title: "Not enough games to be Postseason Eligible."});

    if (!regenerate) {
        $("#mrdaRankingPointsContainer").on('change', 'input.chart', function (e) {
            let tr = e.target.closest('tr');
            let dt = $('#mrdaRankingPoints').DataTable();
            let row = dt.row(tr);
            let team = row.data();
            team.chart = $(this).prop('checked');
            displayRankingChart(dt.rows().data().toArray());
        });
    }
}

const date_str_options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
};

function deriveEventTitle(event) {
    if (event.start_day == event.end_day)
        event.title = new Date(event.start_day + " 00:00:00").toLocaleDateString(undefined,date_str_options) + (event.name ? ": " + event.name : "");
    else if (event.name)
        event.title = event.name;
}

function setupApiGames() {
    $('#gamesModal').on('show.bs.modal', function (e) {
        $apiGames = $('#apiGames');

        if ($apiGames.data('rankingsDate') == $("#date").val())
            return;
        else {
            $apiGames.data('rankingsDate'),$("#date").val();
            if (DataTable.isDataTable('#apiGames'))
                $('#apiGames').DataTable().clear().destroy();
        }

        //filter to games within ranking period
        let gameData = mrda_games.filter(game => {
            let gameDt = new Date(game.date);
            return rankingPeriodStartDt <= gameDt && gameDt < rankingPeriodDeadlineDt;
        }).map(game => {
            let event = mrda_events[game.event_id];
            return {
                date: game.date,
                day: event.start_day != event.end_day ? new Date(game.date).toLocaleDateString(undefined,date_str_options) : "",
                home_team_id: game.home_team_id,
                home_team_name: mrda_teams[game.home_team_id].name + (game.forfeit && game.forfeit_team_id == game.home_team_id ? "<sup class='forfeitInfo'>↓</sup>" : ""),
                home_team_logo: mrda_teams[game.home_team_id].logo && mrda_teams[game.home_team_id].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[game.home_team_id].logo : mrda_teams[game.home_team_id].logo,
                game_score: game.home_team_score + "-" + game.away_team_score + (game.status < 6 ? "<sup class='unvalidatedInfo'>†</sup>" : ""),
                forfeit: game.forfeit,
                away_team_id: game.away_team_id,
                away_team_name: mrda_teams[game.away_team_id].name + (game.forfeit && game.forfeit_team_id == game.away_team_id ? "<sup class='forfeitInfo'>↓</sup>" : ""),
                away_team_logo: mrda_teams[game.away_team_id].logo && mrda_teams[game.away_team_id].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[game.away_team_id].logo : mrda_teams[game.away_team_id].logo,
                event_title: "<span class='event_id' style='display:none;'>" + game.event_id + "</span>" + event.title,
                event_start_dt: new Date(event.start_day + " 00:00:00"),
                event_id: game.event_id,
                status: game.status,
                weight: game.weight,
            }
        });

        let sortedRankingHistory = Object.keys(rankings_history)
            .filter(date => new Date(date + " 00:00:00") <= rankingPeriodStartDt)
            .sort((a, b) => new Date(b) - new Date(a));

        if (sortedRankingHistory.length > 0) {
            let rankingHistoryDate = sortedRankingHistory[0];

            Object.keys(rankings_history[rankingHistoryDate]).forEach(teamId => {
                if (gameData.some(game => (game.home_team_id == teamId || game.away_team_id == teamId) && !game.forfeit)) {
                    let dtStr = getStandardDateString(rankingPeriodStartDt);

                    gameData.push({
                        date: dtStr + " 00:00:00",
                        day: "",
                        home_team_id: teamId,
                        home_team_name: mrda_teams[teamId].name,
                        home_team_logo: mrda_teams[teamId].logo && mrda_teams[teamId].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[teamId].logo : mrda_teams[teamId].logo,
                        game_score: rankings_history[rankingHistoryDate][teamId].rp + " - 1",
                        forfeit: false,
                        away_team_id: null,
                        away_team_name: "Virtual Team",
                        away_team_logo: "team-logos/MRDA-Logo-Acronym.png",
                        event_title: "Virtual Games",
                        event_start_dt: rankingPeriodStartDt,
                        event_id: null,
                        status: null,
                        weight: .25,
                    });
                }
            });
        }

        new DataTable('#apiGames', {
                columns: [
                    { data: 'event_start_dt', name: 'event_start_dt', visible: false },
                    { data: 'event_id', name: 'event_id', visible: false },
                    { data: 'home_team_name', className: 'dt-right' },
                    { data: "home_team_logo", width: '1em', render: function(data, type, full) {return "<img height='40' class='ms-2' src='" + data + "'>"; } },
                    { data: 'game_score', width: '7em', className: 'dt-center' },
                    { data: "away_team_logo", width: '1em', render: function(data, type, full) {return "<img height='40' class='ms-2' src='" + data + "'>"; } },                
                    { data: 'away_team_name' },
                    { data: 'weight', width: '1em', render: function(data, type, full) {return data ? (data * 100).toFixed(0) + "%" : ""; } }
                ],
                data: gameData,
                rowGroup: {
                    dataSrc: ['event_title','day'],
                    emptyDataGroup: null
                },
                lengthChange: false,
                order: [[0, 'desc'], [1, 'desc']],
                ordering: {
                    handler: false
                },
                drawCallback: function (settings) {
                    $(".unvalidatedInfo").tooltip({title: "Score not yet validated"});            
                    $(".forfeitInfo").tooltip({title: "Forfeit"});
                }
            });
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
        return;
    }

    let upcomingEvents = {};

    let upcomingGames = payload.sort((a, b) => new Date(a.event.game_datetime) - new Date(b.event.game_datetime)).map(game => {
        let event_id = game.event.sanctioning_id;
        let gameDay = getStandardDateString(game.event.game_datetime);
        let homeTeamId = game.event.home_league + (game.event.home_league_charter == 'primary' ? 'a' : 'b');
        let awayTeamId = game.event.away_league + (game.event.away_league_charter == 'primary' ? 'a' : 'b');

        if (!(event_id in upcomingEvents))
            upcomingEvents[event_id] = {
                start_day: gameDay,
                end_day: gameDay,
                name: game.sanctioning.event_name
            }
        else if (gameDay != upcomingEvents[event_id].end_day)
            upcomingEvents[event_id].end_day = gameDay;

        let event = upcomingEvents[event_id];

        let rankingHistoryDate = Object.keys(rankings_history)
            .filter(date => new Date(date + " 00:00:00") <= new Date(game.event.game_datetime))
            .sort((a, b) => new Date(b) - new Date(a))[0];

        let homeRp = rankingHistoryDate && rankings_history[rankingHistoryDate] && rankings_history[rankingHistoryDate][homeTeamId] ? rankings_history[rankingHistoryDate][homeTeamId].rp : null;
        let awayRp = rankingHistoryDate && rankings_history[rankingHistoryDate] && rankings_history[rankingHistoryDate][awayTeamId] ? rankings_history[rankingHistoryDate][awayTeamId].rp : null;

        let expectedRatio = homeRp && awayRp ? (homeRp > awayRp ? homeRp / awayRp : awayRp / homeRp) : null;

        return {
            date: game.event.game_datetime,
            home_team_name: mrda_teams[homeTeamId].name,
            home_team_rp: homeRp,
            home_team_logo: mrda_teams[homeTeamId].logo && mrda_teams[homeTeamId].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[homeTeamId].logo : mrda_teams[homeTeamId].logo,
            away_team_name: mrda_teams[awayTeamId].name,
            away_team_rp: awayRp,
            away_team_logo: mrda_teams[awayTeamId].logo && mrda_teams[awayTeamId].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[awayTeamId].logo : mrda_teams[awayTeamId].logo,
            expected_ratio: expectedRatio ? expectedRatio.toFixed(2) : null,
            event_title: "<span class='event_id' style='display:none;'>" + event_id + "</span>",
            event_start_dt: new Date(event.start_day + " 00:00:00"),
            event_id: event_id
        }
    });

    Object.values(upcomingEvents).forEach(deriveEventTitle);

    upcomingGames.forEach(game => {
        let event = upcomingEvents[game.event_id];
        game.day = event.start_day != event.end_day ? new Date(game.date).toLocaleDateString(undefined,date_str_options) : "",
        game.event_title += upcomingEvents[game.event_id].title;
    });

    new DataTable('#upcomingGames', {
            columns: [
                { data: 'event_start_dt', name: 'event_start_dt', visible: false },
                { data: 'event_id', name: 'event_id', visible: false },
                { data: 'home_team_name', className: 'dt-right', render: function(data, type, full) {return data + "<div class='teamRp'>" + full.home_team_rp + "</div>"; } },
                { data: "home_team_logo", width: '1em', render: function(data, type, full) {return "<img height='40' class='ms-2' src='" + data + "'>"; } },
                { data: 'expected_ratio', width: '1em', className: 'dt-center',  render: function(data, type, full) { return data ? (full.home_team_rp > full.away_team_rp ? data + " : 1" : "1 : " + data) : "" } },
                { data: "away_team_logo", width: '1em', render: function(data, type, full) {return "<img height='40' class='ms-2' src='" + data + "'>"; } },                
                { data: 'away_team_name', render: function(data, type, full) {return data + "<div class='teamRp'>" + full.away_team_rp + "</div>"; }  },
            ],
            data: upcomingGames.sort((a, b) => a.sanctioning_start_dt != b.sanctioning_start_dt ? a.sanctioning_start_dt - b.sanctioning_start_dt : new Date(a.date) - new Date(b.date)),
            rowGroup: {
                dataSrc: ['event_title','day'],
                emptyDataGroup: null
            },
            lengthChange: false,
            order: [[0, 'desc'], [1, 'desc']],
            ordering: {
                handler: false
            },
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

    $('#predictorHomeTeamLogo').attr("src",homeTeamId in mrda_teams && mrda_teams[homeTeamId].logo ? mrda_teams[homeTeamId].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[homeTeamId].logo : mrda_teams[homeTeamId].logo : "team-logos\\MRDA-Logo-Acronym.png")
    $('#predictorAwayTeamLogo').attr("src",awayTeamId in mrda_teams && mrda_teams[awayTeamId].logo ? mrda_teams[awayTeamId].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[awayTeamId].logo : mrda_teams[awayTeamId].logo : "team-logos\\MRDA-Logo-Acronym.png")
    $('#homeRankingPoints').html(homeRp ?? "&nbsp;");        
    $('#awayRankingPoints').html(awayRp ?? "&nbsp;");
    $('#expectedScoreRatio').html( expectedRatio ? (homeRp > awayRp ? expectedRatio + " : 1" : "1 : " + expectedRatio) : "&nbsp;");        
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

    //setRegion();

    calculateAndDisplayRankings();

    $('#rankingsGeneratedDt').text(new Date(rankings_generated_utc));
    
    $("#date").on( "change", setRankingDates );
    $("#date").on( "change", calculateAndDisplayRankings );
    $("#region").on( "change", calculateAndDisplayRankings );

    $('[data-toggle="tooltip"]').tooltip();
    $('[data-toggle="tooltip"]:not(.noIcon):not(:has(.dt-column-title))').not('th').append(' <i class="bi bi-question-circle"></i>');
    $('th[data-toggle="tooltip"]:not(.noIcon) .dt-column-title').append(' <i class="bi bi-question-circle"></i>');

    $('.betaFlag').tooltip({title: "This rankings table remains unofficial, is in beta and may have unexpected data. Official rankings are determined by the Rankings Panel and are published quarterly."});

    //These are all initially hidden until user input. Setup last.
    Object.values(mrda_events).forEach(deriveEventTitle);

    teamDetailsModal();

    setupUpcomingGames();

    setupPredictedRatioCalc();

    setupApiGames();
}

window.addEventListener('load', main);