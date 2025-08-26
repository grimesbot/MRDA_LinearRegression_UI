class MrdaGame:
    def __init__(self, date, homeTeamId, homeTeamScore, awayTeamId, awayTeamScore):
        self.date = date
        self.homeTeamId = homeTeamId
        self.homeTeamScore = homeTeamScore
        self.awayTeamId = awayTeamId
        self.awayTeamScore = awayTeamScore

    def __str__(self):
        return f"{self.date}: {self.homeTeamId} ({self.homeTeamScore}) - {self.awayTeamId} ({self.awayTeamScore})"