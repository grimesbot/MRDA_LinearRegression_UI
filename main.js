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
            $dropdown.append($("<option />").val(thisWedStr).text(`Current (${thisWedStr})`));
            $dropdown.val(thisWedStr);
        }

        let dtStr = getStandardDateString(searchDt);
        $dropdown.append($("<option />").val(dtStr).text(`Q${(searchDt.getMonth() + 1) / 3} ${searchDt.getFullYear()} (${dtStr})`));
        
        if (searchDt == todayDt)
            $dropdown.val(dtStr);
    }
}

function renderRatio (data) 
{ 
    if (data) {
        let rounded = data.toFixed(2);
        if (!config.ratio_cap)
            return rounded;
        if (data > config.ratio_cap)
            return rounded + " (" + config.ratio_cap.toFixed(2) + ")";
        if (data < 1/config.ratio_cap)
            return rounded + " (" + (1/config.ratio_cap).toFixed(2) + ")";
        return rounded;
    } else {
        return "";
    }
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
                            (game.scores[game.homeTeamId] > game.scores[game.awayTeamId] ? " W " : " L ") + " vs. " + apiTeams[game.awayTeamId].teamName 
                            : (game.scores[game.awayTeamId] > game.scores[game.homeTeamId] ? " W " : " L ") +  " @ " + apiTeams[game.homeTeamId].teamName),
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
                    game.scores[game.awayTeamId] + (game.scores[game.homeTeamId] > game.scores[game.awayTeamId] ? " W " : " L ") + " vs. " + apiTeams[game.awayTeamId].teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " ") 
                    : game.scores[game.homeTeamId] + (game.scores[game.awayTeamId] > game.scores[game.homeTeamId] ? " W " : " L ") + " @ " + apiTeams[game.homeTeamId].teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " ")),
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
                label: team.teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " "),
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
                                return context[0].raw.teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " ");
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

    let mrdaLinearRegressionSystem = new MrdaLinearRegressionSystem(apiTeams);

    mrdaLinearRegressionSystem.updateRankings(linear_regression_ranking_history, $("#date").val());

    mrdaLinearRegressionSystem.addGameHistory(groupedApiGames, $("#date").val());

    mrdaLinearRegressionSystem.calculateActiveStatus($("#date").val());

    //console.log("Rankings for " + $("#date").val());
    mrdaLinearRegressionSystem.rankTeams();

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
        $pctErrorDiv.append("Total: " + meanAbsoluteLogErrorPercent(mrdaLinearRegressionSystem.absoluteLogErrors));
    }

    displayRankingChart(Object.values(mrdaLinearRegressionSystem.mrdaTeams), $("#date").val());

    let regenerate = DataTable.isDataTable('#mrdaRankingPoints');

    if (regenerate)
        $('#mrdaRankingPoints').DataTable().clear().destroy();        

    new DataTable('#mrdaRankingPoints', {
        columns: [
            { name: 'rankSort', data: 'rankSort', visible: false},
            { title: 'Rank', data: 'rank', className: 'dt-teamDetailsClick', orderData: [0,1] },
            { title: 'Team', data: 'teamName', className: 'dt-teamDetailsClick' },
            { title: 'Ranking Points', data: 'rankingPoints', className: 'dt-teamDetailsClick' },
            { title: 'Error', data: 'relStdErr', render: function (data, type, full) { return "± " + data + "%"; }, className: 'dt-teamDetailsClick relStdErr' },
            { title: 'Games Count',  data: 'activeStatusGameCount', className: 'dt-teamDetailsClick'},
            { title: 'Postseason Eligible', data: 'postseasonEligible', render: function (data, type, full) { return data ? 'Yes' : 'No'; }, className: 'dt-teamDetailsClick'},
            { title: "Chart", data: 'chart', orderable: false, render: function (data, type, full) { return "<input type='checkbox' class='chart' " + (data ? "checked" : "") + "></input>"; }}
        ],
        data: Object.values(mrdaLinearRegressionSystem.mrdaTeams),
        paging: false,
        searching: false,
        info: false,
        order: {
            name: 'rankSort',
            dir: 'asc'
        }
    });

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
    var apiGamesDt = new DataTable('#apiGames', {
            columns: [
                { title: "Date", name: 'date', data: 'date', render: getStandardDateString},
                { title: "Home Team", data: 'homeTeamId', render: function (data) { return apiTeams[data].teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " "); } },
                { title: "Home Score", data: 'homeTeamScore', render: function(data, type, full) { return data + (full.forfeit ? "*" : ""); }},
                { title: "Away Score", data: 'awayTeamScore', render: function(data, type, full) { return data + (full.forfeit ? "*" : ""); }} ,
                { title: "Away Team", data: 'awayTeamId', render: function (data) { return apiTeams[data].teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " "); } },
                { title: "Event Name", data: 'eventName'},
                { title: "Type", render: function (data, type, full) { return full.championship ? "Championship" : full.qualifier ? "Qualifier" : "Regular Season"; }},
                { title: "Validated", data: 'validated'},
                //{ title: "Excluded", render: function (data, type, full) { return "<input type='checkbox' class='excluded'></input>"; }}
            ],
            data: [...groupedApiGames.values()].flat(1),
            lengthChange: false,
            order: {
                name: 'date',
                dir: 'desc'
            }
        });
}


async function main() {

    //document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    populateRankingDates();

    await buildTeamsAndGames();

    calculateAndDisplayRankings();

    teamDetailsModal();

    setupApiGames();

    $("#date").on( "change", calculateAndDisplayRankings );
}

window.addEventListener('load', main);