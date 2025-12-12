const mrdaLinearRegressionSystem = new MrdaLinearRegressionSystem(rankings_history, mrda_teams, mrda_events, mrda_games);

const urlParams = new URLSearchParams(window.location.search);

let rankingPeriodDeadlineDt = null;
let rankingPeriodStartDt = null;
let lastQtrDate = null;

function setRankingDates() {
    rankingPeriodDeadlineDt = new Date(`${$("#date").val()} 00:00:00`);
    rankingPeriodStartDt = mrdaLinearRegressionSystem.getSeedDate(rankingPeriodDeadlineDt);

    let lastQtrDateStr = $("#date option:selected").nextAll().filter((i,e) => $(e).text().trim().startsWith("Q")).first().val();
    
    lastQtrDate = lastQtrDateStr ? new Date(`${lastQtrDateStr} 00:00:00`) : null;
}

function getNextRankingDeadline(date) {
    let searchDt = new Date(date);
    searchDt.setHours(0, 0, 0, 0);

    if ((searchDt.getMonth() + 1) % 3 == 0 && searchDt.getDate() <= 7 && searchDt.getDay() <= 3) {
        if (searchDt.getDay() == 3)
            return searchDt;
        else {
            searchDt.setDate(searchDt.getDate() + ((3 - searchDt.getDay() + 7) % 7));
            return searchDt;
        }
    } else {
        searchDt.setMonth(searchDt.getMonth() + (3 - ((searchDt.getMonth() + 1) % 3)));
        searchDt.setDate(1); // Set to first of month
        searchDt.setDate(1 + ((3 - searchDt.getDay() + 7) % 7)); // Set to Wednesday = 3
        return searchDt;
    }
}

function populateRankingDates() {
    let allRankingDts = [...mrdaLinearRegressionSystem.mrdaRankingsHistory.keys()].sort((a, b) => a - b);

    let searchDt = getNextRankingDeadline(allRankingDts[0]);
    let newestRankingDt = getNextRankingDeadline(allRankingDts.at(-1));

    let dateOptions = [];

    while (searchDt <= newestRankingDt) {
        dateOptions.push({
            date: new Date(searchDt),
            value: `${searchDt.getFullYear()}-${searchDt.getMonth() + 1}-${searchDt.getDate()}`,
            text: `Q${(searchDt.getMonth() + 1) / 3} ${searchDt.getFullYear()}`,
            selected: false
        });
        searchDt.setMonth(searchDt.getMonth() + 3); // Add 3 months (a quarter)
        searchDt.setDate(1); // Set to first of month
        searchDt.setDate(1 + ((3 - searchDt.getDay() + 7) % 7)); // Set to Wednesday = 3
    }

    let queryDt = null;
    if (urlParams.has("date")) {
        queryDt = new Date(urlParams.get("date"));
        if (isNaN(queryDt))
            queryDt = null;
        else {
            queryDt.setHours(0, 0, 0, 0);
            queryDt.setDate(queryDt.getDate() + ((3 - queryDt.getDay() + 7) % 7));
        }
    }

    let current = new Date();
    if (current < newestRankingDt) {
        current.setHours(0, 0, 0, 0);
        current.setDate(current.getDate() + ((3 - current.getDay() + 7) % 7)); // Set to next Wednesday = 3
        let currentDateOptions = dateOptions.filter(o => o.date.getTime() == current.getTime());
        if (currentDateOptions.length == 0) {
                dateOptions.push({
                date: current,
                value: `${current.getFullYear()}-${current.getMonth() + 1}-${current.getDate()}`,
                text: `Today`,
                selected: !queryDt || queryDt.getTime() == current.getTime()
            });
        } else if (!queryDt || queryDt.getTime() == current.getTime()) {
            currentDateOptions[0].selected = true;
        }
    }

    if (queryDt) {
        let queryDtDateOptions = dateOptions.filter(o => o.date.getTime() == queryDt.getTime());
        if (queryDtDateOptions.length == 0) {
                dateOptions.push({
                date: queryDt,
                value: `${queryDt.getFullYear()}-${queryDt.getMonth() + 1}-${queryDt.getDate()}`,
                text: queryDt.toLocaleDateString(undefined, {year:"2-digit",month:"numeric",day:"numeric"}),
                selected: true
            });
        } else {
            queryDtDateOptions[0].selected = true;
        }
    }

    let $dropdown = $("#date");
    
    dateOptions.sort((a,b) => b.date - a.date).forEach(o => {
        $dropdown.append(new Option(o.text, o.value, o.selected, o.selected));
    });

    setRankingDates();
    $dropdown.on( "change", setRankingDates );
}

function setRegion() {
    $region = $("#region");
    if (urlParams.has("region") && $region.find(`option[value='${urlParams.get("region")}']`).length > 0)
        $region.val(urlParams.get("region"));
    return;

    var offset = new Date().getTimezoneOffset();
    if ((-6*60) < offset && offset < (3*60))
        $("#region").val("EUR");
    else
        $("#region").val("AM");
}

function teamDetailsModal() {
    let $teamDetailModal = $('#teamDetailModal');
    let $olderGamesBtn = $("#loadOlderGames");
    let team = null;
    let date = rankingPeriodDeadlineDt;
    let minGameDt = rankingPeriodStartDt;
    
    // Initialize the Team Ranking Point History chart. Data will be set on team row click.
    let teamChart = new Chart(document.getElementById("teamChart"), {
                data: {
                    datasets: [{
                        type: 'scatter',
                        label: 'Game Points (2023 Algorithm)',
                        data: [],
                        pointRadius: 5,
                    }, {
                        type: 'lineWithErrorBars',
                        label: 'Ranking Points ± Standard Error',
                        data: [],
                        showLine: true
                    }],
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

    // Initialize the team game history DataTable. Data will be set on team row click.
    let teamGameHistoryDT = new DataTable('#teamGameHistory', {
        columns: [
            { width: '1em', className: 'dt-center timeTooltip', name: 'date', data: 'date', render: function (data, type, row) { return type === 'display' ? `<div data-toggle="tooltip" title="${data.toLocaleTimeString(undefined,{timeStyle: "short"})}">${data.toLocaleDateString(undefined,{weekday: "short"})}</div>` : data }},
            { width: '1em', className: 'dt-center narrow', render: function (data, type, row) { return row.getWL(team.teamId) }},
            { width: '1em', className: 'dt-center narrow', render: function (data, type, row) { return row.getAtVs(team.teamId) }},
            //{ width: '5em', className: 'dt-right', render: function (data, type, row) { return row.getWlAtVs(team.teamId) }},
            { width: '1em', className: 'px-1', render: function(data, type, game) {return "<img height='30' src='" + game.getOpponentTeam(team.teamId).logo + "'>"; } },
            { className: 'ps-1 text-overflow-ellipsis', render: function (data, type, game) { 
                let opponent = game.getOpponentTeam(team.teamId);
                let teamRanking = opponent.getRanking(game.date);
                if (teamRanking && teamRanking.rank)
                    return `<span class="teamRank" data-toggle="tooltip" title="Global rank as of ${teamRanking.date.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}">${teamRanking.rank}</span> ${opponent.name}`
                return opponent.name; 
            }},
            { width: '1em', className: 'dt-center noWrap', render: function (data, type, row) { return row.getTeamsScore(team.teamId) }},
            { width: '1em', className: 'dt-center', render: function (data, type, row) { return row.getActualRatio(team.teamId) } },            
            { width: '1em', className: 'dt-center', render: function (data, type, row) { return row.getExpectedRatio(team.teamId) } },
            { width: '1em', className: 'dt-center', data: 'weight', render: function(data, type, game) {return data ? `${(data * 100).toFixed(0)}%` : ""; } }
        ],
        data: [],
        dom: 't',
        paging: false,
        searching: false,
        info: false,
        rowGroup: {
            dataSrc: ['event'],
            startRender: function (rows, group) {
                let tr = document.createElement('tr');
                let th = document.createElement('th');

                th.colSpan = 6;
                th.textContent = group.getEventTitleWithDate();
                th.className = "text-overflow-ellipsis";
                tr.appendChild(th);

                th = document.createElement('th');
                th.colSpan = 3;
                th.className = "rpBeforeAfter";

                let rpBefore = team.getRankingPoints(group.startDt);
                let rpAfter = team.getRankingPoints(group.endDt, true);

                if (rpBefore && rpAfter) {
                    let icon = "bi-arrow-right";
                    if (rpAfter > rpBefore)
                        icon = "bi-arrow-up-right";
                    else if (rpBefore > rpAfter)
                        icon = "bi-arrow-down-right";
                    th.innerHTML = `${rpBefore.toFixed(2)} <i class='bi ${icon}'></i> ${rpAfter.toFixed(2)}`;                    
                } else if (rpAfter) {
                    th.innerHTML = rpAfter.toFixed(2);
                }

                tr.appendChild(th);
                return tr;
            },
        },
        order: {
            name: 'date',
            dir: 'desc'
        },
        ordering: {
            handler: false,
            indicators: false
        },
        layout: {
            bottomStart: $('<div class="outsideRankingPeriod">Not in current Ranking Period.</div>')
        },
        drawCallback: function (settings) {
            $('.timeTooltip [data-toggle="tooltip"], .teamRank[data-toggle="tooltip"]').tooltip();
        }
    });

    $('#mrdaRankingPointsContainer').on('click', 'td.dt-teamDetailsClick', function (e) {
        let tr = e.target.closest('tr');
        let row = $('#mrdaRankingPoints').DataTable().row(tr);
        let clickedTeam = row.data();

        if (team && clickedTeam.teamId == team.teamId && rankingPeriodDeadlineDt == date) {
            $teamDetailModal.modal('show');
            return; 
        }

        team = clickedTeam;
        date = rankingPeriodDeadlineDt;
        minGameDt = rankingPeriodStartDt;
        
        $('#teamName').text(team.name);
        $('#teamAverageRankingPoints').text(team.rankingPoints);

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
            minChartDt = new Date(minChartDt).setDate(minChartDt.getDate() - 7);

        let rankingHistory = [];
        let errorBarMinFrequency = (date - minChartDt) / 16;
        let lastDtWithErrorBars = null;
        let teamRankingHistoryArray = Array.from(team.rankingHistory.entries()).filter(rh => rh[0] <= date);
        for (const [dt, ranking] of teamRankingHistoryArray) {
            let chartErrs = false;
            let index = teamRankingHistoryArray.findIndex(([key]) => key === dt);
            if (index == 0 || index == teamRankingHistoryArray.length - 1 || dt == date)
                chartErrs = true;
            else {
                let lastRanking = teamRankingHistoryArray[index - 1];
                let nextRanking = teamRankingHistoryArray[index + 1];
                if (Math.abs(lastRanking[1].relativeStandardError - ranking.relativeStandardError) > 5
                    || Math.abs(nextRanking[1].relativeStandardError - ranking.relativeStandardError) > 5)
                    chartErrs = true;
            }

            if (!chartErrs && (dt - lastDtWithErrorBars) > errorBarMinFrequency)
                chartErrs = true;

            if (chartErrs)
                lastDtWithErrorBars = dt;

            let errMin = ranking.rankingPoints - ranking.standardError;
            let errMax = ranking.rankingPoints + ranking.standardError;
                
            rankingHistory.push({
                x: dt,
                y: ranking.rankingPoints,
                yMin: chartErrs ? errMin : null,
                yMax: chartErrs ? errMax : null,
                title: dt.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}),
                label: `RP: ${ranking.rankingPoints} ± ${ranking.relativeStandardError}% (${errMin.toFixed(2)} .. ${errMax.toFixed(2)})`
            });
        }
            
        teamChart.data.datasets[0].data = team.gameHistory.filter(game => game.gamePoints[team.teamId]).map(game => {
            return { 
                x: game.date, 
                y: game.gamePoints[team.teamId],
                title: game.getGameAndEventTitle(),
                label: `${game.getGameSummary(team.teamId)}: ${game.gamePoints[team.teamId].toFixed(2)}`
            }});
        teamChart.data.datasets[1].data = rankingHistory;
        teamChart.options.scales.x.min = minChartDt;
        teamChart.options.scales.x.max = rankingPeriodDeadlineDt;
        teamChart.update();

        teamGameHistoryDT.clear().rows.add(team.gameHistory.filter(game => minGameDt <= game.date && game.date < rankingPeriodDeadlineDt)).draw();

        if (team.gameHistory.some(game => game.date < minGameDt))
            $olderGamesBtn.show();
        else
            $olderGamesBtn.hide();
        
        $teamDetailModal.modal('show');
    });

    $olderGamesBtn.on('click', function (e) {
        let newMinDt = mrdaLinearRegressionSystem.getSeedDate(minGameDt);
        teamGameHistoryDT.rows.add(team.gameHistory.filter(game => newMinDt <= game.date && game.date < minGameDt)).draw();
        minGameDt = newMinDt;
        if (team.gameHistory.some(game => game.date < minGameDt))
            $olderGamesBtn.show();
        else
            $olderGamesBtn.hide();
    });
}

function displayRankingChart(teams) {
    let rankingChart = Chart.getChart("rankingsChart");

    if (rankingChart != undefined) {
        rankingChart.options.scales.x.min = rankingPeriodStartDt;
        rankingChart.options.scales.x.max = rankingPeriodDeadlineDt;
        rankingChart.update();
        return;
    }

    let datasets = [];

    teams.slice(0, 5).forEach(team => {
        team.chart = true;
        datasets.push({
            teamId: team.teamId,
            region: team.region,
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
                },
                colors: {
                    forceOverride: true
                }
            },
            responsive: true,
            maintainAspectRatio: false
        },
    });

    $("#mrdaRankingPointsContainer").on('change', 'input.chart', function (e) {
        let tr = e.target.closest('tr');
        let dt = $('#mrdaRankingPoints').DataTable();
        let row = dt.row(tr);
        let team = row.data();
        team.chart = $(this).prop('checked');
        if (team.chart) {
            rankingChart.data.datasets.push({
                teamId: team.teamId,
                label: team.name,
                data: Array.from(team.rankingHistory, ([date, ranking]) => ({ x: date, y: ranking.rankingPoints})),
                showLine: true
            });
        } else 
            rankingChart.data.datasets = rankingChart.data.datasets.filter(dataset => dataset.teamId != team.teamId);
        rankingChart.update();
    });
}

function regionChange() {
    let region = $("#region").val();
    let teams = Object.values(mrdaLinearRegressionSystem.mrdaTeams)
        .filter(team => (team.wins + team.losses) > 0 && (team.region == region || region == "GUR"))
        .sort((a, b) => a.rankSort - b.rankSort);
    
    let rankingChart = Chart.getChart("rankingsChart");
    rankingChart.data.datasets = [];
    teams.forEach((team, index) => {
        team.chart = index < 5;
        if (team.chart) {
            rankingChart.data.datasets.push({
                teamId: team.teamId,
                label: team.name,
                data: Array.from(team.rankingHistory, ([date, ranking]) => ({ x: date, y: ranking.rankingPoints})),
                showLine: true
            });
        }
    });    
    rankingChart.update();

    $('#mrdaRankingPoints').DataTable().clear().rows.add(teams).draw();
}

function calculateAndDisplayRankings() {

    let region = $("#region").val();

    mrdaLinearRegressionSystem.rankTeams(rankingPeriodDeadlineDt, rankingPeriodStartDt, lastQtrDate);

    let teams = Object.values(mrdaLinearRegressionSystem.mrdaTeams)
        .filter(team => (team.wins + team.losses) > 0 && (team.region == region || region == "GUR"))
        .sort((a, b) => a.rankSort - b.rankSort);

    displayRankingChart(teams);

    if (DataTable.isDataTable('#mrdaRankingPoints')) {
        $('#mrdaRankingPoints').DataTable().clear().rows.add(teams).draw();
        return;
    }

    let annotations = document.createElement('div');
    annotations.className = "annotations";
    annotations.innerHTML = "*Not enough games to be Postseason Eligible.";
    annotations.innerHTML += "<br><sup>↓</sup>Two rank penalty applied for each forfeit.";    

    let exportOptions = { 
        columns: [0,3,4,5,6], 
        format: { 
            header: function (data, columnIdx) { return ['Rank','Team','Ranking Points','Relative Standard Error','Game Count'][columnIdx]; } 
        },        
    };

    new DataTable('#mrdaRankingPoints', {
        columns: [
            { name: 'rank', data: 'rank', width: '1em', className: 'dt-teamDetailsClick dt-center pe-1', 
                render: function (data, type, full) { 
                    if (type === 'sort')
                        return full.rankSort;
                    else if ($("#region").val() != "GUR")
                        return full.regionRank;
                    else
                        return data;
                }
            },
            { data: 'delta', width: '1em', className: 'dt-teamDetailsClick noWrap delta dt-center px-1',
                render: function (data, type, full) {
                    let delta = $("#region").val() == "GUR" ? full.delta : full.regionDelta;
                    if (type === 'display') {
                        if (!full.rank)
                            return "";
                        else if (delta > 0) 
                            return `<i class="bi bi-triangle-fill up text-success"></i> <span class="up text-success">${delta}</span>`;
                        else if (delta < 0)
                            return `<i class="bi bi-triangle-fill down text-danger"></i> <span class="down text-danger">${-delta}</span>`;
                        else if (delta == null)
                            return '<i class="bi bi-star-fill text-body-secondary"></i>'
                        else
                            return '<i class="bi bi-circle-fill text-body-tertiary"></i>';
                    } else
                        return delta;
                }
             },
            { data: 'logo', width: '1em', orderable: false, className: 'dt-teamDetailsClick px-1', render: function (data, type, full) { return data ? "<img height='40' src='" + data + "'>" : ""; } },            
            { data: 'name', orderable: false, className: 'dt-teamDetailsClick teamName px-1 text-overflow-ellipsis', 
                render: function (data, type, full) {
                    if (['display','export'].includes(type) && full.activeStatus) {
                        let result = data;
                        for (let i = 0; i < full.forfeits; i++) {
                            if (type === 'display')
                                result += "<sup class='forfeitPenalty'>↓</sup>";
                            else if (type === 'export')
                                result += " ↓";
                        }
                        return result;
                    }
                    return data;
                },
                createdCell: function (td, cellData, rowData, row, col) {
                    if (rowData.location) 
                        $(td).append("<div class='teamLocation'>" + rowData.location + "</div>");
                }
            },
            { data: 'rankingPoints', width: '1em', className: 'dt-teamDetailsClick px-1' },
            { data: 'relStdErr', width: '1em', className: 'dt-teamDetailsClick relStdErr px-1 dt-left', render: function (data, type, full) { return type === 'display' ? `±${data}%` : data; }},
            { data: 'activeStatusGameCount', width: '1em', className: 'dt-teamDetailsClick px-1', render: function (data, type, full) { return type === 'display' && !full.postseasonEligible ? `${data}<span class='postseasonIneligible'>*</span>` : data; } },
            { data: 'wins', width: '1em', orderable: false, className: 'dt-teamDetailsClick px-1 dt-center'},
            { data: 'losses', width: '1.6em', orderable: false, className: 'dt-teamDetailsClick px-1 dt-left'},
            { data: 'chart', width: '1em', className: 'ps-1 dt-center', orderable: false, render: function (data, type, full) { return "<input type='checkbox' class='chart' " + (data ? "checked" : "") + "></input>"; }}
        ],
        data: teams,
        layout: {
            topStart: null,
            topEnd: null,
            bottomStart: annotations,
            bottomEnd: { 
                buttons: [
                    {
                        extend: 'copy',
                        text: '<i class="bi bi-copy"></i>',
                        exportOptions: exportOptions,
                        messageBottom: '*Not enough games to be Postseason Eligible.\n↓ Two rank penalty applied for each forfeit.',
                        title: null,
                    }, 
                    {
                        extend: 'csv',
                        text: '<i class="bi bi-filetype-csv"></i>',
                        exportOptions: exportOptions
                    } 
                ] 
            }
        },
        paging: false,
        searching: false,
        info: false,
        order: {
            name: 'rank',
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
        },
        drawCallback: function (settings) {
            $("#mrdaRankingPoints .forfeitPenalty").tooltip({title: "Two rank penalty applied for each forfeit."});
            $("#mrdaRankingPoints .postseasonIneligible").tooltip({title: "Not enough games to be Postseason Eligible."});
        }
    });
}

function setupApiGames() {
    // Filter to games within ranking period
    let games = mrdaLinearRegressionSystem.mrdaGames
        .filter(game => rankingPeriodStartDt <= game.date && game.date < rankingPeriodDeadlineDt);

    // Add virtual games
    let seedingRankings = mrdaLinearRegressionSystem.getRankingHistory(rankingPeriodStartDt);
    if (seedingRankings) {
        for (const [teamId, ranking] of Object.entries(seedingRankings)) {
            if (games.some(game => !game.forfeit && (game.homeTeamId == teamId || game.awayTeamId == teamId))) {
                games.push(new MrdaGame({
                    date: rankingPeriodStartDt,
                    home_team_id: teamId,
                    home_team_score: ranking.rankingPoints.toFixed(2),
                    away_team_score: 1,
                    weight: .25,
                }, mrdaLinearRegressionSystem.mrdaTeams, mrdaLinearRegressionSystem.mrdaEvents, true));
            }
        }
    }

    if (DataTable.isDataTable('#apiGames')) {
        $('#apiGames').DataTable().clear().rows.add(games).draw();
        return;
    }

    new DataTable('#apiGames', {
            columns: [
                { data: 'event.startDt', visible: false },
                { data: 'date', visible: false },
                { data: 'homeTeam.name', className: 'dt-right' },
                { data: "homeTeam.logo", width: '1em', render: function(data, type, game) {return "<img height='40' class='ms-2' src='" + data + "'>"; } },
                { name: 'score', width: '7em', className: 'dt-center', render: function(data, type, game) {return `${game.scores[game.homeTeamId]} - ${game.scores[game.awayTeamId]}`} },
                { data: "awayTeam.logo", width: '1em', render: function(data, type, game) {return "<img height='40' class='ms-2' src='" + data + "'>"; } },                
                { data: 'awayTeam.name' },
                { data: 'weight', width: '1em', render: function(data, type, game) {return data ? `${(data * 100).toFixed(0)}%` : ""; } }
            ],
            data: games,
            rowGroup: {
                dataSrc: ['event.getEventTitle()','getGameDay()'],
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
}

async function setupUpcomingGames() {
    let games = mrdaLinearRegressionSystem.mrdaGames.filter(game => !game.forfeit && !game.scores[game.homeTeamId] && !game.scores[game.awayTeamId]);

    new DataTable('#upcomingGames', {
        columns: [
            { data: 'event.startDt', visible: false },
            { data: 'date', visible: false },
            { data: 'homeTeam.name', className: 'dt-right', render: function(data, type, game) {return data + "<div class='teamRp'>" + game.homeTeam.getRankingPoints(game.date) + "</div>"; } },
            { data: "homeTeam.logo", width: '1em', render: function(data, type, full) {return "<img height='40' class='ms-2' src='" + data + "'>"; } },
            { width: '1em', className: 'dt-center',  render: function(data, type, game) { return game.expectedRatios[game.homeTeamId] > 1 ? `${game.expectedRatios[game.homeTeamId].toFixed(2)} : 1` : `1 : ${game.expectedRatios[game.awayTeamId].toFixed(2)}` } },
            { data: "awayTeam.logo", width: '1em', render: function(data, type, full) {return "<img height='40' class='ms-2' src='" + data + "'>"; } },                
            { data: 'awayTeam.name', render: function(data, type, game) {return data + "<div class='teamRp'>" + game.awayTeam.getRankingPoints(game.date) + "</div>"; }  },
        ],
        data: games,
        rowGroup: {
            dataSrc: ['event.getEventTitle()','getGameDay()'],
            emptyDataGroup: null
        },
        lengthChange: false,
        order: [[0, 'asc'], [1, 'asc']],
        ordering: {
            handler: false
        },
    });
}

function calculatePredictedRatio() {
    let gameDate = $('#gameDate')[0].valueAsDate;
    let seedDate = mrdaLinearRegressionSystem.getSeedDate(gameDate);

    let homeTeam = mrdaLinearRegressionSystem.mrdaTeams[$('#homeTeam').val()];
    let awayTeam = mrdaLinearRegressionSystem.mrdaTeams[$('#awayTeam').val()];

    let homeRp = null;
    let awayRp = null;    

    if (homeTeam) {
        $('#predictorHomeTeamLogo').attr("src",homeTeam.logo);
        let homeRanking = homeTeam.getRanking(gameDate,false,seedDate);
        if (homeRanking && homeRanking.rankingPoints) {
            homeRp = homeRanking.rankingPoints;
            $('#homeRankingPoints').text(`${homeRp} ±${homeRanking.relativeStandardError}%`);
        } else
            $('#homeRankingPoints').html("&nbsp;");
    }

    if (awayTeam) {
        $('#predictorAwayTeamLogo').attr("src",awayTeam.logo);
        let awayRanking = awayTeam.getRanking(gameDate,false,seedDate);
        if (awayRanking && awayRanking.rankingPoints) {
            awayRp = awayRanking.rankingPoints;
            $('#awayRankingPoints').text(`${awayRp} ±${awayRanking.relativeStandardError}%`);
        } else
            $('#awayRankingPoints').html("&nbsp;");
    }

    if (homeRp && awayRp) {
        if (homeRp > awayRp)
            $('#expectedScoreRatio').text(`${(homeRp/awayRp).toFixed(2)} : 1`);
        else
            $('#expectedScoreRatio').text(`1 : ${(awayRp/homeRp).toFixed(2)}`);
    } else
        $('#expectedScoreRatio').html("&nbsp;");
}

function setupMeanAbsoluteLogError() {
    let tableData = [];

    let quarterOpts = $("#date option").filter((i,e) => $(e).text().trim().startsWith("Q"));

    for (let i = 0; i < (quarterOpts.length - 1); i++) {
        let $quarterOpt = $(quarterOpts[i]);

        tableData.push({
            title: $quarterOpt.text(),
            minDt: new Date(`${$(quarterOpts[i+1]).val()} 00:00:00`),
            maxDt: new Date(`${$quarterOpt.val()} 00:00:00`)
        });
    }

    tableData.push({
        title: "2024 Season (Without Seed Data)",
        minDt: new Date (2023, 10 - 1, 25),
        maxDt: new Date (2024, 10 - 1, 23)
    });

    tableData.push({
        title: "2025 Season",
        minDt: new Date (2024, 10 - 1, 23),
        maxDt: new Date (2025, 10 - 1, 22)
    });

    tableData.push({
        title: "2026 Season",
        minDt: new Date (2025, 10 - 1, 22),
        maxDt: new Date (2026, 10 - 1, 28)
    });

    tableData.push({
        title: "2025+ (All games with Seed Data)",
        minDt: new Date (2024, 10 - 1, 23),
        maxDt: null
    });

    tableData.push({
        title: "All Games",
        minDt: null,
        maxDt: null
    });

    let predictedGames = mrdaLinearRegressionSystem.mrdaGames.filter(game => !game.forfeit && game.scores[game.homeTeamId] && game.expectedRatios[game.homeTeamId]);
    for (const data of tableData) {
        let games = predictedGames.filter(game => (data.minDt == null || data.minDt <= game.date) && (data.maxDt == null || game.date < data.maxDt));
        data.gameCount = games.length;
        if (data.gameCount > 0) {
            let absLogErrSum = 0;
            games.forEach(game => absLogErrSum += Math.abs(Math.log(game.expectedRatios[game.homeTeamId]/(game.scores[game.homeTeamId]/game.scores[game.awayTeamId]))));
            let avg = absLogErrSum/data.gameCount;
            let errorPct = (Math.exp(avg) - 1) * 100;
            data.meal = errorPct.toFixed(2) + '%';
        } else {
            data.meal = null;
        }
    }

    new DataTable('#meanAbsoluteLogError', {
        columns: [
            { data: 'title'},
            { title: 'Start Date', data: 'minDt', render: DataTable.render.date()},
            { title: 'End Date', data: 'maxDt', render: DataTable.render.date()},            
            { title: 'Game Count', data: 'gameCount'},
            { title: 'Error %', data: 'meal'}
        ],
        data: tableData,
        dom: 't',
        paging: false,
        searching: false,
        info: false,
        ordering: false
    });
}

function setupPredictedRatioCalc() {
    $('#gameDate')[0].valueAsDate = new Date();

    Object.values(mrdaLinearRegressionSystem.mrdaTeams).sort((a, b) => a.name.localeCompare(b.name)).forEach(team => {
        $('#homeTeam').append($("<option />").val(team.teamId).text(team.name));
        $('#awayTeam').append($("<option />").val(team.teamId).text(team.name));
    });

    $('#homeTeam').change(calculatePredictedRatio);
    $('#awayTeam').change(calculatePredictedRatio);
    $('#gameDate').change(calculatePredictedRatio);
}

$(function() {

    //document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    populateRankingDates();

    $('#rankingsGeneratedDt').text(new Date(rankings_generated_utc));

    setRegion();

    calculateAndDisplayRankings();
    $("#date").on( "change", calculateAndDisplayRankings);
    
    $('[data-toggle="tooltip"]').tooltip();
    $('[data-toggle="tooltip"]:not(.noIcon):not(:has(.dt-column-title))').not('th').append(' <i class="bi bi-question-circle"></i>');
    $('th[data-toggle="tooltip"]:not(.noIcon) .dt-column-title').append(' <i class="bi bi-question-circle"></i>');

    $('.betaFlag').tooltip({title: "This rankings table remains unofficial, is in beta and may have unexpected data. Official rankings are determined by the Rankings Panel and are published quarterly."});

    $("#region").on( "change", regionChange);

    //These are all initially hidden until user input. Setup last.
    teamDetailsModal();

    setupUpcomingGames();

    setupPredictedRatioCalc();

    setupApiGames();
    $("#date").on( "change", setupApiGames);

    setupMeanAbsoluteLogError();

})