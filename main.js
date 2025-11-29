const mrdaLinearRegressionSystem = new MrdaLinearRegressionSystem(rankings_history, mrda_teams, mrda_events, mrda_games);

const urlParams = new URLSearchParams(window.location.search);

let rankingPeriodDeadlineDt = null;
let rankingPeriodStartDt = null;
function setRankingDates() {
    rankingPeriodDeadlineDt = new Date($("#date").val() + " 00:00:00");
    rankingPeriodStartDt = mrdaLinearRegressionSystem.getSeedDate(rankingPeriodDeadlineDt);
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
    let team = null;
    let date = rankingPeriodDeadlineDt;
    
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
            { name: 'date', data: 'date', render: DataTable.render.date()},
            { name: 'score', render: function (data, type, row) { return row.getGameSummary(team.teamId) }, className: 'text-overflow-ellipsis' },
            { name: 'expectedRatio', render: function (data, type, row) { return row.getExpectedRatio(team.teamId) } },
            { name: 'actualRatio', render: function (data, type, row) { return row.getActualRatio(team.teamId) } },
            { name: 'beforeRankingPoints', render: function (data, type, row) { return team.getRankingPoints(row.date) }, className: 'border-left' },
            { name: 'afterRankingPoints', render: function (data, type, row) { return team.getRankingPoints(row.date, true) }}                
        ],
        data: [],
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
        createdRow: function (row, data, dataIndex) {
            if (data.date <= rankingPeriodStartDt)
                $(row).addClass('outsideRankingPeriod');
        },
        layout: {
            bottomStart: $('<div class="outsideRankingPeriod">Not in currently selected Ranking Period.</div>')
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
            minChartDt = new Date(minChartDt).setDate(minChartDt.getDate() - 7);

        let rankingHistory = [];
        let errorBarMinFrequency = (rankingPeriodDeadlineDt - minChartDt) / 16;
        let lastDtWithErrorBars = null;
        let teamRankingHistoryArray = Array.from(team.rankingHistory.entries());
        for (const [dt, ranking] of teamRankingHistoryArray) {
            let chartErrs = false;
            let index = teamRankingHistoryArray.findIndex(([key]) => key === dt);
            if (index == 0 || index == teamRankingHistoryArray.length - 1 || dt == rankingPeriodDeadlineDt)
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
                title: mrdaLinearRegressionSystem.mrdaEvents[game.eventId].getEventTitleWithDate(),
                label: `${game.getGameSummary(team.teamId)}: ${game.gamePoints[team.teamId].toFixed(2)}`
            }});
        teamChart.data.datasets[1].data = rankingHistory;
        teamChart.options.scales.x.min = minChartDt;
        teamChart.options.scales.x.max = rankingPeriodDeadlineDt;
        teamChart.update();

        teamGameHistoryDT.clear().rows.add(team.gameHistory.filter(game => game.date < rankingPeriodDeadlineDt)).draw();
        
        $teamDetailModal.modal('show');
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

    mrdaLinearRegressionSystem.rankTeams(rankingPeriodDeadlineDt, rankingPeriodStartDt);

    let teams = Object.values(mrdaLinearRegressionSystem.mrdaTeams)
        .filter(team => (team.wins + team.losses) > 0 && (team.region == region || region == "GUR"))
        .sort((a, b) => a.rankSort - b.rankSort);

    displayRankingChart(teams);

    if (DataTable.isDataTable('#mrdaRankingPoints')) {
        $('#mrdaRankingPoints').DataTable().clear().rows.add(teams).draw();
        return;
    }

    new DataTable('#mrdaRankingPoints', {
        columns: [
            { name: 'rank', data: 'rank', width: '1em', className: 'dt-teamDetailsClick', 
                render: function (data, type, full) { 
                    if (type === 'sort')
                        return full.rankSort;
                    else if ($("#region").val() != "GUR")
                        return full.regionRank;
                    else
                        return data;
                }
            },
            { data: 'logo', orderable: false, className: 'dt-teamDetailsClick teamLogo', render: function (data, type, full) { return data ? "<img height='40' src='" + data + "'>" : ""; } },            
            { data: 'name', orderable: false, className: 'dt-teamDetailsClick teamName', 
                createdCell: function (td, cellData, rowData, row, col) {
                    let $td = $(td);
                    if (rowData.activeStatus && rowData.forfeits > 0)
                        $td.append("<sup class='forfeitPenalty'>↓</sup>");
                    if (rowData.location) {
                        $td.append("<div class='teamLocation'>" + rowData.location + "</div>");
                    }
                }
            },
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
                { data: 'weight', width: '1em', render: function(data, type, game) {return data ? (data * 100).toFixed(0) + "%" : ""; } }
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

})