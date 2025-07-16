class MrdaGame:
    def __init__(self, date, homeTeamId, homeTeamScore, awayTeamId, awayTeamScore, qualifier, championship):
        self.date = date
        self.homeTeamId = homeTeamId
        self.homeTeamScore = homeTeamScore
        self.awayTeamId = awayTeamId
        self.awayTeamScore = awayTeamScore
        self.qualifier = qualifier
        self.championship = championship

    def __str__(self):
        return f"{self.date}: {self.homeTeamId} ({self.homeTeamScore}) - {self.awayTeamId} ({self.awayTeamScore}) [Q: {self.qualifier}, C: {self.championship}]"