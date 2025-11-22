
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
    
    let current = new Date();
    current.setHours(0, 0, 0, 0);
    current.setDate(current.getDate() + ((3 - current.getDay() + 7) % 7)); // Set to next Wednesday = 3
    let searchDt = new Date (2023, 9 - 1, 6);

    while (searchDt <= current) {
        searchDt.setMonth(searchDt.getMonth() + 3); // Add 3 months (a quarter)
        searchDt.setDate(searchDt.getDate() - searchDt.getDay()); // Set to first of month
        searchDt.setDate(searchDt.getDate() + ((3 - searchDt.getDay() + 7) % 7)); // Set to Wednesday = 3

        if (searchDt > current){
            let currentStr = `${current.getFullYear()}-${current.getMonth() + 1}-${current.getDate()}`;
            $dropdown.prepend($("<option />").val(currentStr).text('Today'));
            $dropdown.val(currentStr);
        }

        let dtStr = `${searchDt.getFullYear()}-${searchDt.getMonth() + 1}-${searchDt.getDate()}`;
        $dropdown.prepend($("<option />").val(dtStr).text(`Q${(searchDt.getMonth() + 1) / 3} ${searchDt.getFullYear()}`));
        
        if (searchDt == current)
            $dropdown.val(dtStr);
    }

    setRankingDates();
    $dropdown.on( "change", setRankingDates );
}

function setRegion() {
    var offset = new Date().getTimezoneOffset();
    if ((-6*60) < offset && offset < (3*60))
        $("#region").val("EUR");
    else
        $("#region").val("AM");
}

function teamDetailsModal(mrdaLinearRegressionSystem) {
    let $teamDetailModal = $('#teamDetailModal');

    $('#mrdaRankingPointsContainer').on('click', 'td.dt-teamDetailsClick', function (e) {
        let tr = e.target.closest('tr');
        let row = $('#mrdaRankingPoints').DataTable().row(tr);
        let team = row.data();

        if ($teamDetailModal.data('teamId') == team.teamId) {
            $teamDetailModal.modal('show');
            return; 
        } else {
            $teamDetailModal.data('teamId', team.teamId);

            if (DataTable.isDataTable('#teamGameHistory'))
                $('#teamGameHistory').DataTable().clear().destroy();
            
            let teamChart = Chart.getChart("teamChart");
            if (teamChart != undefined) {
                teamChart.destroy();
            }
        }

        $('#teamName').text(team.name);
        $('#teamAverageRankingPoints').text(team.rankingPoints.toFixed(2));

        if (team.logo)
            $('#teamLogo').attr('src', team.logo).show();
        else
            $('#teamLogo').hide();

        if (team.location)
            $('#teamLocation').text(team.location).show();
        else
            $('#teamLocation').hide();

        let minChartDt = [...team.rankingHistory.keys()].sort((a, b) => a - b)[0];
        let oldestGame = team.gameHistory.filter(game => game.gamePoints[team.teamId]).sort((a,b) => a.date - b.date)[0];
        if (oldestGame && oldestGame.date < minChartDt)
        {
            minChartDt = new Date(oldestGame.date);
            dayOfWeek = minChartDt.getDay();
            minChartDt.setDate(minChartDt.getDate() - (dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4));
        }

        let rankingHistory = [];
        let errorBarMinFrequency = (rankingPeriodDeadlineDt - minChartDt) / 16;
        let lastDtWithErrorBars = null;
        let teamRankingHistoryArray = Array.from(team.rankingHistory.entries());
        for (const [date, ranking] of teamRankingHistoryArray) {
            let chartErrs = false;
            let index = teamRankingHistoryArray.findIndex(([key]) => key === date);
            if (index == 0 || index == teamRankingHistoryArray.length - 1 || date == rankingPeriodDeadlineDt)
                chartErrs = true;
            else {
                let lastRanking = teamRankingHistoryArray[index - 1];
                let nextRanking = teamRankingHistoryArray[index + 1];
                if (Math.abs(lastRanking[1].relativeStandardError - ranking.relativeStandardError) > 5
                    || Math.abs(nextRanking[1].relativeStandardError - ranking.relativeStandardError) > 5)
                    chartErrs = true;
            }

            if (!chartErrs && (date - lastDtWithErrorBars) > errorBarMinFrequency)
                chartErrs = true;

            if (chartErrs)
                lastDtWithErrorBars = date;

            let errMin = ranking.rankingPoints - ranking.standardError;
            let errMax = ranking.rankingPoints + ranking.standardError;
                
            rankingHistory.push({
                x: date,
                y: ranking.rankingPoints,
                yMin: chartErrs ? errMin : null,
                yMax: chartErrs ? errMax : null,
                title: date.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}),
                label: `RP: ${ranking.rankingPoints} ± ${ranking.relativeStandardError}% (${errMin.toFixed(2)} .. ${errMax.toFixed(2)})`
            });
        }

        new Chart(document.getElementById("teamChart"), {
            data: {
                datasets: [{
                    type: 'scatter',
                    label: 'Game Points (2023 Algorithm)',
                    data: team.gameHistory.filter(game => game.gamePoints[team.teamId]).map(game => {
                        return { 
                            x: game.date, 
                            y: game.gamePoints[team.teamId],
                            title: mrdaLinearRegressionSystem.mrdaEvents[game.eventId].getEventTitleWithDate(),
                            label: `${game.getGameSummary(team.teamId, mrdaLinearRegressionSystem.mrdaTeams)}: ${game.gamePoints[team.teamId].toFixed(2)}`
                        }}),                        
                    pointRadius: 5,
                }, {
                    type: 'lineWithErrorBars',
                    label: 'Ranking Points ± Standard Error',
                    data: rankingHistory,
                    showLine: true
                }],
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                        min: minChartDt,
                        max: rankingPeriodDeadlineDt
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest',
                    axis: 'xy'
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

        new DataTable('#teamGameHistory', {
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
                score: game.getGameSummary(team.teamId, mrdaLinearRegressionSystem.mrdaTeams),
                expectedRatio: team.teamId in game.expectedRatios ? game.expectedRatios[team.teamId].toFixed(2) : "",
                actualRatio: !game.forfeit ? (game.scores[team.teamId]/(game.scores[game.homeTeamId == team.teamId ? game.awayTeamId : game.homeTeamId])).toFixed(2) : "",
                beforeRankingPoints: team.getRankingPoints(game.date) ?? "",
                afterRankingPoints: team.getRankingPoints(game.date, true) ?? ""
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
}

function displayRankingChart(teams) {
    let rankingChart = Chart.getChart("rankingsChart");
    if (rankingChart != undefined)
        rankingChart.destroy();

    let datasets = [];

    teams.filter(team => team.chart).sort((a, b) => a.rank - b.rank).forEach(team => {
        datasets.push({
            label: team.name,
            data: Array.from(team.rankingHistory, ([date, ranking]) => ({ x: date, y: ranking.rankingPoints})),
            showLine: true
        });
    });

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
                interaction: {
                    intersect: false,
                    mode: 'nearest',
                    axis: 'x'
                },
                plugins: {
                    tooltip: {
                        itemSort: function(a, b) {
                            return b.raw.y - a.raw.y;
                        },
                        callbacks: {
                            title: function(context) {
                                return context[0].raw.x.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
                            },
                            label: function(context) {
                                return context.dataset.label + ": " + context.raw.y.toFixed(2);
                            }
                        }
                    }
                },
                responsive: true,
                maintainAspectRatio: false
            }
        });
}

function calculateAndDisplayRankings(mrdaLinearRegressionSystem) {

    let region = $("#region").val();

    mrdaLinearRegressionSystem.rankTeams(rankingPeriodDeadlineDt, region);

    let teams = Object.values(mrdaLinearRegressionSystem.mrdaTeams).filter(team => (team.wins + team.losses) > 0);
    if (region != "GUR")
        teams = teams.filter(team => team.region == teams);

    displayRankingChart(teams);

    let regenerate = DataTable.isDataTable('#mrdaRankingPoints');
    if (regenerate)
        $('#mrdaRankingPoints').DataTable().clear().destroy();        

    new DataTable('#mrdaRankingPoints', {
        columns: [
            { name: 'rankSort', data: 'rank', visible: false},
            { data: 'rank', width: '1em', className: 'dt-teamDetailsClick', render: function (data, type, full) { return full.activeStatus ? (region == "GUR" ? data : full.regionRank) : ""; }, orderData: [0,1] },
            { data: 'logo', orderable: false, className: 'dt-teamDetailsClick teamLogo', render: function (data, type, full) { return data ? "<img height='40' src='" + data + "'>" : ""; } },            
            { data: 'name', orderable: false, className: 'dt-teamDetailsClick teamName', 
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
        data: teams,
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
        createdRow: function (row, data, dataIndex) {
            if (data.postseasonPosition != null) {
                $(row).addClass('postseasonPosition-' + data.postseasonPosition);
            }
        }
    });

    $("#mrdaRankingPoints .forfeitPenalty").tooltip({title: "Two rank penalty applied for each forfeit."});
    $("#mrdaRankingPoints .postseasonIneligible").tooltip({title: "Not enough games to be Postseason Eligible."});

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

function setupApiGames(mrdaLinearRegressionSystem) {
    $('#gamesModal').on('show.bs.modal', function (e) {
        $apiGames = $('#apiGames');

        if ($apiGames.data('rankingsDate') == rankingPeriodDeadlineDt)
            return;
        else {
            $apiGames.data('rankingsDate',rankingPeriodDeadlineDt);
            if (DataTable.isDataTable('#apiGames'))
                $('#apiGames').DataTable().clear().destroy();
        }

        //filter to games within ranking period
        let games = mrdaLinearRegressionSystem.mrdaGames
            .filter(game => rankingPeriodStartDt <= game.date && game.date < rankingPeriodDeadlineDt);
//            .map(game => {
//                let event = mrda_events[game.eventId];
//                return {
//                    date: game.date,
//                    day: event.start_day != event.end_day ? new Date(game.date).toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"}) : "",
//                    home_team_id: game.home_team_id,
//                    home_team_name: mrda_teams[game.home_team_id].name + (game.forfeit && game.forfeitTeamId == game.home_team_id ? "<sup class='forfeitInfo'>↓</sup>" : ""),
//                    home_team_logo: mrda_teams[game.home_team_id].logo && mrda_teams[game.home_team_id].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[game.home_team_id].logo : mrda_teams[game.home_team_id].logo,
//                    game_score: game.home_team_score + "-" + game.away_team_score + (game.status < 6 ? "<sup class='unvalidatedInfo'>†</sup>" : ""),
//                    forfeit: game.forfeit,
//                    away_team_id: game.away_team_id,
//                    away_team_name: mrda_teams[game.away_team_id].name + (game.forfeit && game.forfeitTeamId == game.away_team_id ? "<sup class='forfeitInfo'>↓</sup>" : ""),
//                    away_team_logo: mrda_teams[game.away_team_id].logo && mrda_teams[game.away_team_id].logo.startsWith("/central/") ? "https://assets.mrda.org" + mrda_teams[game.away_team_id].logo : mrda_teams[game.away_team_id].logo,
//                    event_title: "<span class='eventId' style='display:none;'>" + game.eventId + "</span>" + event.title,
//                    event_start_dt: new Date(event.start_day + " 00:00:00"),
//                    eventId: game.eventId,
//                    status: game.status,
//                    weight: game.weight,
//                }
//            });

        let seedingRankingDt = [...mrdaLinearRegressionSystem.mrdaRankingsHistory.keys()]
                                .filter(dt => dt <= rankingPeriodStartDt)
                                .sort((a, b) => b - a)[0];

        if (seedingRankingDt) {
            for (const [teamId, ranking] of Object.entries(mrdaLinearRegressionSystem.mrdaRankingsHistory.get(seedingRankingDt))) {
                if (games.some(game => !game.forfeit && (game.home_team_id == teamId || game.away_team_id == teamId))) {
                    let seedingGame = {
                        date: rankingPeriodStartDt,
                        home_team_id: teamId,
                        scores = {},
                        forfeit: false,
                        eventId: null,
                        status: null,
                        weight: .25,
                    }
                    seedingGame.scores[teamId] = 

                    games.push(new MrdaGame() {

                    })

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
                        eventId: null,
                        status: null,
                        weight: .25,
                    });
                }
            }
        }

        



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
                        eventId: null,
                        status: null,
                        weight: .25,
                    });
                }
            });
        }

        new DataTable('#apiGames', {
                columns: [
                    { data: 'event_start_dt', name: 'event_start_dt', visible: false },
                    { data: 'eventId', name: 'eventId', visible: false },
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
        let eventId = game.event.sanctioning_id;
        let gameDay = getStandardDateString(game.event.game_datetime);
        let homeTeamId = game.event.home_league + (game.event.home_league_charter == 'primary' ? 'a' : 'b');
        let awayTeamId = game.event.away_league + (game.event.away_league_charter == 'primary' ? 'a' : 'b');

        if (!(eventId in upcomingEvents))
            upcomingEvents[eventId] = {
                start_day: gameDay,
                end_day: gameDay,
                name: game.sanctioning.event_name
            }
        else if (gameDay != upcomingEvents[eventId].end_day)
            upcomingEvents[eventId].end_day = gameDay;

        let event = upcomingEvents[eventId];

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
            event_title: "<span class='eventId' style='display:none;'>" + eventId + "</span>",
            event_start_dt: new Date(event.start_day + " 00:00:00"),
            eventId: eventId
        }
    });

    Object.values(upcomingEvents).forEach(deriveEventTitles);

    upcomingGames.forEach(game => {
        let event = upcomingEvents[game.eventId];
        game.day = event.start_day != event.end_day ? new Date(game.date).toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"}) : "",
        game.event_title += upcomingEvents[game.eventId].title;
    });

    new DataTable('#upcomingGames', {
            columns: [
                { data: 'event_start_dt', name: 'event_start_dt', visible: false },
                { data: 'eventId', name: 'eventId', visible: false },
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

$(function() {

    //document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    populateRankingDates();

    //setRegion();

    let mrdaLinearRegressionSystem = new MrdaLinearRegressionSystem(rankings_history, mrda_teams, mrda_events, mrda_games);

    calculateAndDisplayRankings(mrdaLinearRegressionSystem);

    $('#rankingsGeneratedDt').text(new Date(rankings_generated_utc));
    
    
    $("#date").on( "change", calculateAndDisplayRankings );
    $("#region").on( "change", calculateAndDisplayRankings );

    $('[data-toggle="tooltip"]').tooltip();
    $('[data-toggle="tooltip"]:not(.noIcon):not(:has(.dt-column-title))').not('th').append(' <i class="bi bi-question-circle"></i>');
    $('th[data-toggle="tooltip"]:not(.noIcon) .dt-column-title').append(' <i class="bi bi-question-circle"></i>');

    $('.betaFlag').tooltip({title: "This rankings table remains unofficial, is in beta and may have unexpected data. Official rankings are determined by the Rankings Panel and are published quarterly."});

    //These are all initially hidden until user input. Setup last.
    teamDetailsModal(mrdaLinearRegressionSystem);

    setupUpcomingGames();

    setupPredictedRatioCalc();

    setupApiGames(mrdaLinearRegressionSystem);
});