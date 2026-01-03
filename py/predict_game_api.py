from flask import Flask, jsonify, request
from flask_cors import CORS
import statsmodels.api as sm
import math

RATIO_CAP = 4
RANKING_SCALE = 100

app = Flask(__name__)
CORS(app)

def linear_regression_ratio(games, seeding):
    result = {}

    team_ids = []
    for game in games:
        home_team = game.get("th")
        away_team = game.get("ta")
        if not home_team in team_ids:
            team_ids.append(home_team)
        if not away_team in team_ids:
            team_ids.append(away_team)

    Y = []
    X = []
    W = []

    for game in games:
        home_team = game.get("th")
        away_team = game.get("ta")

        # Because ln(score_ratio) is undefined if either team's score is 0, we treat a score of 0 as 0.1.
        # A blowout game like this will have a very low weight anyway.
        home_score = max(game.get("sh"),0.1)
        away_score = max(game.get("sa"),0.1)

        # Add log of score ratio as observation
        Y.append(math.log(home_score/away_score))

        # Build x column of regressors (teams) and whether they played in the game
        x_col = []
        for team_id in team_ids:
            if team_id == home_team:
                x_col.append(1)
            elif team_id == away_team:
                x_col.append(-1)
            else:
                x_col.append(0)
        X.append(x_col)

        score_ratio = home_score/away_score if home_score > away_score else away_score/home_score

        # Set game weight
        W.append(max(3 ** ((RATIO_CAP - score_ratio)/2), 1/1000000) if score_ratio > RATIO_CAP else 1)

    # Add virtual games if we have seeding
    if seeding is not None:
        # Add virtual games for existing teams
        for team_id in team_ids:
            # Existing team if in seeding rankings
            if team_id in seeding:

                # Add observation as score log ratio
                # Virtual team's RP is 1.00. Result of virtual game is team's seeding (RP) to 1.
                Y.append(math.log(seeding[team_id]/RANKING_SCALE))

                # Build x column of regressors (teams), real team is home team (1), no away team (-1) since it was virtual team
                x_col = []
                for t in team_ids:
                    if t == team_id:
                        x_col.append(1)
                    else:
                        x_col.append(0)
                X.append(x_col)

                W.append(1/4)

    wls = sm.WLS(Y, X, W).fit()
    wls_result = wls.params

    for i, team_id in enumerate(team_ids):
        result[team_id] = math.exp(wls_result[i])

    return result

@app.route("/ratio-predict-game", methods=["POST"])
def mock_game():
    data = request.json
    home_team = data.get("th")
    away_team = data.get("ta")
    games = data.get("games")
    seeding = data.get("seeding")

    lr_result = linear_regression_ratio(games, seeding)

    home_rp = lr_result[home_team] * RANKING_SCALE
    away_rp = lr_result[away_team] * RANKING_SCALE

    ratios = []

    for i in range(1,4):
        ratios.append(i/4)

    for i in range(2,8):
        ratios.append(i/2)

    for i in range(4,16):
        ratios.append(i)

    result = []
    for ratio in ratios:
        mock_game = {"th": home_team, "sh": ratio, "ta": away_team, "sa": 1}
        games.append(mock_game)
        lr_result = linear_regression_ratio(games, seeding)
        new_home_rp = lr_result[home_team] * RANKING_SCALE
        new_away_rp = lr_result[away_team] * RANKING_SCALE
        result.append({
            "r": ratio,
            "dh": round(new_home_rp - home_rp, 2),
            "da": round(new_away_rp - away_rp, 2)
            })
        games.remove(mock_game)

    return jsonify(result), 200