import { resolve, join, normalize } from 'path';
import { promisify } from 'util';
import { readdir, readFile } from 'fs';

import { IAppInfo } from '../src/definition/IAppInfo';
import { ICompilerFile } from '../src/definition/ICompilerFile';
import { IMapCompilerFile } from '../src/definition/IMapCompilerFile';
import AppsCompiler from '../src/AppsCompiler';

const readdirPromise = promisify(readdir);
const readfilePromise = promisify(readFile);

function getPath() {
    const dir = process.argv[2];
    const resolved = normalize(join(__dirname, dir));
    return resolved;
}

async function walkDirectory(directory: string): Promise<ICompilerFile[]> {
    const dirents = await readdirPromise(directory, { withFileTypes: true });
    const files = await Promise.all(
        dirents
            .map(async (dirent) => {
                const res = resolve(directory, dirent.name);

                const dirsToIgnore = ['node_modules', '.git'];
                if (dirsToIgnore.some((dir) => res.includes(dir))) {
                    return null;
                }

                if (dirent.isDirectory()) {
                    return walkDirectory(res);
                }

                const content = await readfilePromise(res, 'utf8');

                return {
                    content,
                    name: res,
                    version: 0,
                };
            })
            .filter((entry) => entry),
    );

    return Array.prototype.concat(...files);
}

function truncateFilename(fileName: string, projectDirectory: string): string {
    return normalize(fileName).substring(projectDirectory.length + 1);
}

function filterProjectFiles(projectDirectory: string, directoryWalkData: ICompilerFile[]): ICompilerFile[] {
    return directoryWalkData
        // Leave out falsy values
        .filter((file: ICompilerFile) => file)
        // Get the file names like it was inside the project's directory
        .map((file: ICompilerFile) => ({ ...file, name: truncateFilename(file.name, projectDirectory) }))
        // Files which start with `.` are supposed to be hidden
        .filter((file: ICompilerFile) => !file.name.startsWith('.'));
}

function makeICompilerFileMap(compilerFiles: ICompilerFile[]): IMapCompilerFile {
    return compilerFiles
        .map((file: ICompilerFile) => ({ [file.name]: file }))
        .reduce((acc: IMapCompilerFile, curr: IMapCompilerFile) => ({ ...acc, ...curr }), {});
}

function getAppInfo(projectFiles: ICompilerFile[]): IAppInfo {
    const appJson = projectFiles.filter((file: ICompilerFile) => file.name === 'app.json')[0];

    if (!appJson) {
        throw new Error('There is no app.json file in the project');
    }

    try {
        const { name, version, classFile } = JSON.parse(appJson.content);
        return { name, version, classFile };
    } catch (error) {
        throw new Error('app.json parsing fail');
    }
}

function getTypescriptFilesFromProject(projectFiles: ICompilerFile[]): ICompilerFile[] {
    return projectFiles.filter((file: ICompilerFile) => file.name.endsWith('.ts'));
}

(async () => {
    const projectDirectory = getPath();

    const directoryWalkData: ICompilerFile[] = await walkDirectory(projectDirectory);
    const projectFiles: ICompilerFile[] = filterProjectFiles(projectDirectory, directoryWalkData);
    const tsFiles: ICompilerFile[] = getTypescriptFilesFromProject(projectFiles);
    const appInfo: IAppInfo = getAppInfo(projectFiles);
    const files: IMapCompilerFile = makeICompilerFileMap(tsFiles);
    debugger;
    const compiler = new AppsCompiler();
    // @ts-ignore
    const js = compiler.toJs({
        files,
        appInfo,
    });

    debugger;
})();
