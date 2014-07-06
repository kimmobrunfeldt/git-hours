
import os
import subprocess
import json

import nap

def run_command(command, **kwargs):
    """Runs an command and returns the stdout and stderr as a string.

    Args:
        command: Command to execute in Popen's list format.
                 E.g. ['ls', '..']

    Returns:
        tuple. (return_value, stdout, stderr), where return_value is the
        numerical exit code of process and stdout/err are strings containing
        the output. stdout/err is None if nothing has been output.
    """
    print(command)
    p = subprocess.Popen(command.split(), stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, **kwargs)
    stdout, stderr = p.communicate()
    return_value = p.wait()
    return return_value, stdout, stderr


def main():
    api = nap.url.Url('https://api.github.com/')

    repos = api.get('search/repositories', params={
        'q': 'language:javascript',
        'sort': 'stars',
        'order': 'desc'
    }).json()['items']

    works = []
    for repo in repos[:20]:
        if not os.path.exists(repo['name']):
            run_command('git clone %s' % repo['clone_url'])

        run_command('git checkout master', cwd=repo['name'])

        _, stdout, stderr = run_command('githours', cwd=repo['name'])

        total_work = json.loads(stdout)['total']
        total_work['repository'] = repo['full_name']
        works.append(total_work)

    f = open('stats.json', 'w')
    f.write(json.dumps(works))
    f.close()


if __name__ == '__main__':
    main()
