import { exec, ExecOptions } from 'child_process';
import crypto from 'crypto';
import {
	BrowserWindow,
	Menu,
	MenuItem,
	app,
	clipboard,
	dialog,
	shell,
	type IpcMainInvokeEvent,
	Notification,
	SaveDialogOptions,
} from 'electron';
import fs from 'fs';
import fsPromises from 'fs/promises';
import https from 'node:https';
import nodePath from 'path';
import * as Sentry from '@sentry/electron/main';
import { __, sprintf, LocaleData, defaultI18n } from '@wordpress/i18n';
import { validateBlueprintData } from 'common/lib/blueprint-validation';
import { bumpStat } from 'common/lib/bump-stat';
import {
	calculateDirectorySize,
	isWordPressDirectory,
	arePathsEqual,
	isEmptyDir,
	pathExists,
} from 'common/lib/fs-utils';
import { getWordPressVersion } from 'common/lib/get-wordpress-version';
import { isErrnoException } from 'common/lib/is-errno-exception';
import { getAuthenticationUrl } from 'common/lib/oauth';
import { createPassword } from 'common/lib/passwords';
import { portFinder } from 'common/lib/port-finder';
import { sortSites } from 'common/lib/sort-sites';
import { Snapshot } from 'common/types/snapshot';
import { StatsGroup, StatsMetric } from 'common/types/stats';
import { MAIN_MIN_WIDTH, SIDEBAR_WIDTH } from 'src/constants';
import { sendIpcEventToRendererWithWindow } from 'src/ipc-utils';
import { getBetaFeatures as getBetaFeaturesFromLib } from 'src/lib/beta-features';
import { getImporterMetric, getBlueprintMetric } from 'src/lib/bump-stats/lib';
import {
	openCertificate as openCertificateDialog,
	isRootCATrusted,
	trustRootCA,
} from 'src/lib/certificate-manager';
import { simplifyErrorForDisplay } from 'src/lib/error-formatting';
import { buildFeatureFlags } from 'src/lib/feature-flags';
import { sanitizeFolderName } from 'src/lib/generate-site-name';
import { getImageData } from 'src/lib/get-image-data';
import { convertMySqlToSqlite } from 'src/lib/sqlite-conversion';
import { getSiteUrl } from 'src/lib/get-site-url';
import { exportBackup } from 'src/lib/import-export/export/export-manager';
import { ExportOptions } from 'src/lib/import-export/export/types';
import { ImportExportEventData } from 'src/lib/import-export/handle-events';
import { defaultImporterOptions, importBackup } from 'src/lib/import-export/import/import-manager';
import { BackupArchiveInfo } from 'src/lib/import-export/import/types';
import { isInstalled } from 'src/lib/is-installed';
import { getUserLocaleWithFallback } from 'src/lib/locale-node';
import * as oauthClient from 'src/lib/oauth';
import { phpGetThemeDetails } from 'src/lib/php-get-theme-details';
import { shellOpenExternalWrapper } from 'src/lib/shell-open-external-wrapper';
import { installSqliteIntegration, keepSqliteIntegrationUpdated } from 'src/lib/sqlite-versions';
import { updateSiteUrl } from 'src/lib/update-site-url';
import * as windowsHelpers from 'src/lib/windows-helpers';
import {
	getWordPressProvider,
	getProviderConstants as getProviderConstantsFromProvider,
} from 'src/lib/wordpress-provider';
import { getLogsFilePath, writeLogToFile, type LogLevel } from 'src/logging';
import { getMainWindow } from 'src/main-window';
import { popupMenu, setupMenu } from 'src/menu';
import { shouldExcludeFromSync, shouldLimitDepth } from 'src/modules/sync/lib/tree-utils';
import { supportedEditorConfig, SupportedEditor } from 'src/modules/user-settings/lib/editor';
import { getUserTerminal } from 'src/modules/user-settings/lib/ipc-handlers';
import { winFindEditorPath } from 'src/modules/user-settings/lib/win-editor-path';
import { SiteServer, createSiteWorkingDirectory } from 'src/site-server';
import { DEFAULT_SITE_PATH, getSiteThumbnailPath } from 'src/storage/paths';
import {
	loadUserData,
	lockAppdata,
	saveUserData,
	unlockAppdata,
	updateAppdata,
} from 'src/storage/user-data';
import { Blueprint } from 'src/stores/wpcom-api';
import type { WpCliResult } from 'src/lib/wp-cli-process';
import type { RawDirectoryEntry } from 'src/modules/sync/types';

export {
	isStudioCliInstalled,
	installStudioCli,
	uninstallStudioCli,
} from 'src/modules/cli/lib/ipc-handlers';

export {
	addSyncOperation,
	cancelSyncOperation,
	clearSyncOperation,
	connectWpcomSites,
	disconnectWpcomSites,
	downloadSyncBackup,
	exportSiteForPush,
	getConnectedWpcomSites,
	pushArchive,
	removeExportedSiteTmpFile,
	removeSyncBackup,
	updateConnectedWpcomSites,
	updateSingleConnectedWpcomSite,
} from 'src/modules/sync/lib/ipc-handlers';

export {
	createSnapshot,
	deleteSnapshot,
	updateSnapshot,
} from 'src/modules/preview-site/lib/ipc-handlers';

export {
	getInstalledAppsAndTerminals,
	getUserEditor,
	getUserLocale,
	getUserTerminal,
	saveUserEditor,
	saveUserLocale,
	saveUserTerminal,
	showUserSettings,
} from 'src/modules/user-settings/lib/ipc-handlers';

async function sendThumbnailChangedEvent( event: IpcMainInvokeEvent, id: string ) {
	if ( event.sender.isDestroyed() ) {
		return;
	}
	const thumbnailData = await getThumbnailData( event, id );
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	sendIpcEventToRendererWithWindow( parentWindow, 'thumbnail-changed', {
		id,
		imageData: thumbnailData,
	} );
}

function mergeSiteDetailsWithRunningDetails( sites: SiteDetails[] ): SiteDetails[] {
	return sites.map( ( site ) => {
		const server = SiteServer.get( site.id );
		if ( server ) {
			return server.details;
		}
		return site;
	} );
}

export async function getSiteDetails( _event: IpcMainInvokeEvent ): Promise< SiteDetails[] > {
	const userData = await loadUserData();

	const { sites } = userData;

	// Ensure we have an instance of a server for each site we know about
	for ( const site of sites ) {
		if ( ! SiteServer.get( site.id ) && ! site.running ) {
			SiteServer.create( site );
		}
	}

	return mergeSiteDetailsWithRunningDetails( sites );
}

export async function importSite(
	event: IpcMainInvokeEvent,
	{ id, backupFile }: { id: string; backupFile: BackupArchiveInfo }
): Promise< SiteDetails > {
	const site = SiteServer.get( id );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	try {
		if ( ! isWordPressDirectory( site.details.path ) ) {
			await getWordPressProvider().setupWordPressFilesOnly( site.details.path );
		}

		const onEvent = ( data: ImportExportEventData ) => {
			const parentWindow = BrowserWindow.fromWebContents( event.sender );
			sendIpcEventToRendererWithWindow( parentWindow, 'on-import', data, id );
		};
		const result = await importBackup( backupFile, site.details, onEvent, defaultImporterOptions );

		bumpStat( StatsGroup.STUDIO_IMPORT, getImporterMetric( result.importerType ) );

		if ( result?.meta?.phpVersion ) {
			site.details.phpVersion = result.meta.phpVersion;
		}

		// Clear blueprint so it doesn't overwrite imported data on first start
		site.meta.blueprint = undefined;

		return site.details;
	} catch ( e ) {
		bumpStat( StatsGroup.STUDIO_IMPORT, StatsMetric.FAILURE );
		// Don't report validation errors to Sentry - these are expected user errors
		if (
			! ( e instanceof Error ) ||
			( ! e.message.includes( 'No suitable importer found for the provided backup contents' ) &&
				! e.message.includes( 'No suitable backup handler found for the provided backup file' ) )
		) {
			Sentry.captureException( e );
		}
		throw e;
	}
}

export async function createSite(
	event: IpcMainInvokeEvent,
	path: string,
	config: {
		siteName?: string;
		wpVersion?: string;
		customDomain?: string;
		enableHttps?: boolean;
		siteId?: string;
		phpVersion?: string;
		blueprint?: Blueprint;
	} = {}
): Promise< SiteDetails > {
	const {
		siteName,
		wpVersion,
		customDomain,
		enableHttps,
		siteId,
		blueprint,
		phpVersion = getWordPressProvider().DEFAULT_PHP_VERSION,
	} = config;

	const forceSetupSqlite = false;

	const metric = getBlueprintMetric( blueprint?.slug );
	bumpStat( StatsGroup.STUDIO_SITE_CREATE, metric );

	// We only recursively create the directory if the user has not selected a
	// path from the dialog (and thus they use the "default" or suggested path).
	if ( ! ( await pathExists( path ) ) && path.startsWith( DEFAULT_SITE_PATH ) ) {
		fs.mkdirSync( path, { recursive: true } );
	}

	if ( ! ( await isEmptyDir( path ) ) && ! isWordPressDirectory( path ) ) {
		// Form validation should've prevented a non-empty directory from being selected
		throw new Error( 'The selected directory is not empty nor an existing WordPress site.' );
	}
	let userData = await loadUserData();

	const allPaths = userData?.sites?.map( ( site ) => site.path ) || [];
	if ( allPaths.includes( path ) ) {
		throw new Error( 'The selected directory is already in use.' );
	}

	const port = await portFinder.getOpenPort();

	const details = {
		id: siteId || crypto.randomUUID(),
		name: siteName || nodePath.basename( path ),
		path,
		adminPassword: createPassword(),
		port,
		running: false,
		phpVersion,
		isWpAutoUpdating: wpVersion === getWordPressProvider().DEFAULT_WORDPRESS_VERSION,
		customDomain,
		enableHttps,
	} as const;

	const server = SiteServer.create( details, { wpVersion, blueprint: blueprint?.blueprint } );

	if ( ( await pathExists( path ) ) && ( await isEmptyDir( path ) ) ) {
		try {
			await createSiteWorkingDirectory( server, wpVersion );
		} catch ( error ) {
			// If site creation failed, remove the generated files and re-throw the
			// error so it can be handled by the caller.
			await shell.trashItem( path );
			throw error;
		}
	}

	if ( isWordPressDirectory( path ) ) {
		// If the directory contains a WordPress installation, and user wants to force SQLite
		// integration, let's rename the wp-config.php file to allow WP Now to create a new one
		// and initialize things properly.
		if ( forceSetupSqlite && ( await pathExists( nodePath.join( path, 'wp-config.php' ) ) ) ) {
			fs.renameSync(
				nodePath.join( path, 'wp-config.php' ),
				nodePath.join( path, 'wp-config-studio.php' )
			);
		}
		if ( ! ( await pathExists( nodePath.join( path, 'wp-config.php' ) ) ) ) {
			await installSqliteIntegration( path );
			await getWordPressProvider().installWordPressWhenNoWpConfig(
				server,
				siteName || nodePath.basename( path ),
				details.adminPassword
			);
		} else {
			await updateSiteUrl( server, getSiteUrl( details ) );
		}
	}

	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	sendIpcEventToRendererWithWindow( parentWindow, 'theme-details-updating', { id: details.id } );
	try {
		await lockAppdata();
		userData = await loadUserData();

		userData.sites.push( server.details );
		sortSites( userData.sites );

		await saveUserData( userData );
		return server.details;
	} finally {
		await unlockAppdata();
	}
}

export async function updateSite(
	event: IpcMainInvokeEvent,
	updatedSite: SiteDetails
): Promise< void > {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		const updatedSites = userData.sites.map( ( site ) =>
			site.id === updatedSite.id ? updatedSite : site
		);
		userData.sites = updatedSites;

		const server = SiteServer.get( updatedSite.id );
		if ( server ) {
			await server.updateSiteDetails( updatedSite );
		}
		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

export async function startServer(
	event: IpcMainInvokeEvent,
	id: string
): Promise< SiteDetails | null > {
	const server = SiteServer.get( id );
	if ( ! server ) {
		return null;
	}

	await keepSqliteIntegrationUpdated( server.details.path );

	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	try {
		await server.start();
	} catch ( error ) {
		/**
		 * We don't want to track WASM memory errors in Sentry
		 * because they are caused by the user's system not having enough memory
		 * and aren't a bug in Studio.
		 *
		 * When the error is thrown, we show a user-friendly message
		 * to the user, with instructions on how to provide more memory to Studio.
		 */
		if (
			error instanceof Error &&
			error.message.includes( 'Cannot allocate Wasm memory for new instance' )
		) {
			throw new Error( 'WASM_ERROR_NOT_ENOUGH_MEMORY' );
		}

		const contexts: Record< string, Record< string, unknown > > = {
			server: {
				running: server.details.running,
				phpVersion: server.details.phpVersion,
				port: server.details.port,
				hasCustomDomain: !! server.details.customDomain,
				httpsEnabled: !! server.details.enableHttps,
			},
		};

		// Include sanitized CLI args if available from error
		if ( error instanceof Error && 'cliArgs' in error ) {
			contexts.startup = ( error as Error & { cliArgs: Record< string, unknown > } ).cliArgs;
		}

		Sentry.captureException( error, {
			tags: {
				provider: getWordPressProvider().PROVIDER_TYPE,
			},
			contexts,
		} );
		if (
			error instanceof Error &&
			error.message.includes( '"unreachable" WASM instruction executed' )
		) {
			throw new Error( 'Please try disabling plugins and themes that might be causing the issue.' );
		}
		throw error;
	}

	sendIpcEventToRendererWithWindow( parentWindow, 'theme-details-changed', {
		id,
		details: server.details.themeDetails,
	} );

	if ( server.details.running ) {
		void ( async () => {
			try {
				await server.updateCachedThumbnail();
				await sendThumbnailChangedEvent( event, id );
			} catch ( error ) {
				console.error( `Failed to update thumbnail for server ${ id }:`, error );
			}
		} )();
	}

	console.log( `Server started for '${ server.details.name }'` );
	await updateSite( event, server.details );
	return server.details;
}

export async function stopServer(
	event: IpcMainInvokeEvent,
	id: string
): Promise< SiteDetails | null > {
	const server = SiteServer.get( id );
	if ( ! server ) {
		return null;
	}

	await server.stop();
	await updateSite( event, server.details );
	return server.details;
}

export interface FolderDialogResponse {
	path: string;
	name: string;
	isEmpty: boolean;
	isWordPress: boolean;
}

export async function showSaveAsDialog( event: IpcMainInvokeEvent, options: SaveDialogOptions ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( ! parentWindow ) {
		throw new Error( `No window found for sender of showSaveAsDialog message: ${ event.frameId }` );
	}

	const defaultPath =
		options.defaultPath === nodePath.basename( options.defaultPath ?? '' )
			? nodePath.join( DEFAULT_SITE_PATH, options.defaultPath )
			: options.defaultPath;
	const { canceled, filePath } = await dialog.showSaveDialog( parentWindow, {
		defaultPath,
		...options,
	} );
	if ( canceled ) {
		return '';
	}
	return filePath;
}

export interface FileDialogResponse {
	path: string;
}

export async function writeFile(
	_event: IpcMainInvokeEvent,
	filePath: string,
	content: string
): Promise< { success: boolean; error?: string } > {
	try {
		await fsPromises.writeFile( filePath, content, 'utf-8' );
		return { success: true };
	} catch ( error ) {
		const errorMessage = error instanceof Error ? error.message : String( error );
		writeLogToFile( 'erro', `Error writing file: ${ errorMessage }` );
		return {
			success: false,
			error: errorMessage,
		};
	}
}

export async function getFileContent(
	_event: IpcMainInvokeEvent,
	filePath: string
): Promise< string > {
	try {
		// Read file as UTF-8
		let content = await fsPromises.readFile( filePath, 'utf-8' );

		// Remove BOM (Byte Order Mark) if present
		content = content.replace( /^\uFEFF/, '' );

		return content;
	} catch ( error ) {
		const errorMessage = error instanceof Error ? error.message : String( error );
		writeLogToFile( 'erro', `Error reading file content: ${ errorMessage }` );
		throw new Error( sprintf( __( 'Failed to read file: %s' ), errorMessage ) );
	}
}

export async function showOpenFileDialog(
	event: IpcMainInvokeEvent,
	title: string,
	defaultDialogPath: string,
	filters?: Array< { name: string; extensions: string[] } >
): Promise< FileDialogResponse | null > {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( ! parentWindow ) {
		throw new Error(
			`No window found for sender of showOpenFileDialog message: ${ event.frameId }`
		);
	}

	const { canceled, filePaths } = await dialog.showOpenDialog( parentWindow, {
		title,
		defaultPath: defaultDialogPath !== '' ? defaultDialogPath : DEFAULT_SITE_PATH,
		properties: [ 'openFile' ],
		filters: filters || [
			{ name: 'All Files', extensions: [ '*' ] },
		],
	} );
	if ( canceled || ! filePaths || filePaths.length === 0 ) {
		return null;
	}

	return {
		path: filePaths[ 0 ],
	};
}

export async function showOpenFolderDialog(
	event: IpcMainInvokeEvent,
	title: string,
	defaultDialogPath: string
): Promise< FolderDialogResponse | null > {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( ! parentWindow ) {
		throw new Error(
			`No window found for sender of showOpenFolderDialog message: ${ event.frameId }`
		);
	}

	if ( process.env.E2E && process.env.E2E_OPEN_FOLDER_DIALOG ) {
		// Playwright's filechooser event isn't working in our e2e tests.
		// Use an environment variable to manually set which folder gets selected.
		return {
			path: process.env.E2E_OPEN_FOLDER_DIALOG,
			name: nodePath.basename( process.env.E2E_OPEN_FOLDER_DIALOG ),
			isEmpty: await isEmptyDir( process.env.E2E_OPEN_FOLDER_DIALOG ),
			isWordPress: isWordPressDirectory( process.env.E2E_OPEN_FOLDER_DIALOG ),
		};
	}

	const { canceled, filePaths } = await dialog.showOpenDialog( parentWindow, {
		title,
		defaultPath: defaultDialogPath !== '' ? defaultDialogPath : DEFAULT_SITE_PATH,
		properties: [
			'openDirectory',
			'createDirectory', // allow user to create new directories; macOS only
		],
	} );
	if ( canceled ) {
		return null;
	}

	return {
		path: filePaths[ 0 ],
		name: nodePath.basename( filePaths[ 0 ] ),
		isEmpty: await isEmptyDir( filePaths[ 0 ] ),
		isWordPress: isWordPressDirectory( filePaths[ 0 ] ),
	};
}

export async function getSentryUserId( _event: IpcMainInvokeEvent ) {
	const userData = await loadUserData();
	return userData.sentryUserId;
}

export async function deleteSite( event: IpcMainInvokeEvent, id: string, deleteFiles = false ) {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		const server = SiteServer.get( id );
		console.log( 'Deleting site', id );
		if ( ! server ) {
			throw new Error( 'Site not found.' );
		}
		await server.delete();
		try {
			// Move files to trash
			if ( deleteFiles ) {
				await shell.trashItem( server.details.path );
			}
		} catch ( error ) {
			/* We want to exit gracefully if the there is an error deleting the site files */
			Sentry.captureException( error );
		}
		const newSites = userData.sites.filter( ( site ) => site.id !== id );
		await saveUserData( { ...userData, sites: newSites } );
	} finally {
		await unlockAppdata();
	}
}

export function logRendererMessage(
	event: IpcMainInvokeEvent,
	level: LogLevel,
	...args: unknown[]
): void {
	// 4 characters long so it aligns with the main process logs
	const processId = `ren${ event.sender.id }`;
	writeLogToFile( level, processId, ...args );
}

export async function authenticate( event: IpcMainInvokeEvent, isSignup = false ) {
	const locale = await getUserLocaleWithFallback();
	const authUrl = isSignup ? oauthClient.getSignUpUrl( locale ) : getAuthenticationUrl( locale );
	void shellOpenExternalWrapper( authUrl );
}

export async function getAuthenticationToken() {
	return oauthClient.getAuthenticationToken();
}

export async function isAuthenticated() {
	return oauthClient.isAuthenticated();
}

export async function clearAuthenticationToken() {
	return await updateAppdata( { authToken: undefined } );
}

export async function exportSite(
	event: IpcMainInvokeEvent,
	options: ExportOptions
): Promise< boolean > {
	try {
		await keepSqliteIntegrationUpdated( options.site.path );

		const onEvent = ( data: ImportExportEventData ) => {
			const parentWindow = BrowserWindow.fromWebContents( event.sender );
			sendIpcEventToRendererWithWindow( parentWindow, 'on-export', data, options.site.id );
		};

		const result = await exportBackup( options, onEvent );

		if ( result ) {
			const isDatabaseOnly = options.includes.database && ! options.includes.wpContent;
			bumpStat(
				StatsGroup.STUDIO_EXPORT,
				isDatabaseOnly ? StatsMetric.DATABASE_ONLY : StatsMetric.FULL_SITE
			);
		} else {
			bumpStat( StatsGroup.STUDIO_EXPORT, StatsMetric.FAILURE );
		}

		return result;
	} catch ( e ) {
		bumpStat( StatsGroup.STUDIO_EXPORT, StatsMetric.FAILURE );
		Sentry.captureException( e );
		throw e;
	}
}

export async function saveSnapshotsToStorage( event: IpcMainInvokeEvent, snapshots: Snapshot[] ) {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		userData.snapshots = snapshots;
		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

export async function saveLastSeenVersion( event: IpcMainInvokeEvent, version: string ) {
	await updateAppdata( { lastSeenVersion: version } );
}

export async function getSnapshots( _event: IpcMainInvokeEvent ): Promise< Snapshot[] > {
	const userData = await loadUserData();
	const { snapshots = [] } = userData;
	return snapshots;
}

export async function getLastSeenVersion(
	_event: IpcMainInvokeEvent
): Promise< string | undefined > {
	// If we're running in E2E mode, return the app version
	if ( process.env.E2E ) {
		return app.getVersion();
	}
	const userData = await loadUserData();
	return userData.lastSeenVersion;
}

export async function openSiteURL(
	event: IpcMainInvokeEvent,
	id: string,
	relativeURL = '',
	{ autoLogin = true }: { autoLogin?: boolean } = {}
) {
	const site = SiteServer.get( id );
	if ( ! site?.server?.url ) {
		await showMessageBox( event, {
			type: 'error',
			message: __( 'Failed to open link' ),
			detail: __( 'Please ensure your site files have not been moved or deleted.' ),
		} );
		return;
	}

	let url = new URL( relativeURL, site.server.url );
	if ( autoLogin ) {
		const autoLoginUrl = new URL( '/studio-auto-login', site.server.url );
		autoLoginUrl.searchParams.append( 'redirect_to', url.toString() );
		url = autoLoginUrl;
	}

	void shellOpenExternalWrapper( url.toString() );
}

export function openURL( event: IpcMainInvokeEvent, url: string ) {
	void shellOpenExternalWrapper( url );
}

export function copyText( event: IpcMainInvokeEvent, text: string ) {
	return clipboard.writeText( text );
}

export function getAppGlobals( _event: IpcMainInvokeEvent ): AppGlobals {
	return {
		platform: process.platform,
		appName: app.name,
		appVersion: app.getVersion(),
		arm64Translation: app.runningUnderARM64Translation,
		...buildFeatureFlags(),
	};
}

export function getWpVersion( _event: IpcMainInvokeEvent, id: string ) {
	const server = SiteServer.get( id );
	if ( ! server ) {
		return '-';
	}
	const wordPressPath = server.details.path;
	return getWordPressVersion( wordPressPath );
}

export async function generateProposedSitePath(
	_event: IpcMainInvokeEvent,
	siteName: string
): Promise< FolderDialogResponse > {
	const path = nodePath.join( DEFAULT_SITE_PATH, sanitizeFolderName( siteName ) );

	try {
		return {
			path,
			name: siteName,
			isEmpty: await isEmptyDir( path ),
			isWordPress: isWordPressDirectory( path ),
		};
	} catch ( err ) {
		if ( isErrnoException( err ) && err.code === 'ENOENT' ) {
			return {
				path,
				name: siteName,
				isEmpty: true,
				isWordPress: false,
			};
		}
		throw err;
	}
}

export async function openLocalPath( _event: IpcMainInvokeEvent, path: string ) {
	await shell.openPath( path );
}

export function showItemInFolder( _event: IpcMainInvokeEvent, path: string ) {
	shell.showItemInFolder( path );
}

export async function getThemeDetails(
	event: IpcMainInvokeEvent,
	id: string
): Promise< StartedSiteDetails[ 'themeDetails' ] > {
	const server = SiteServer.get( id );
	if ( ! server ) {
		throw new Error( 'Site not found.' );
	}

	if ( ! server.details.running || ! server.server ) {
		return undefined;
	}
	const themeDetails = await phpGetThemeDetails( server.server );

	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( themeDetails?.path && themeDetails.path !== server.details.themeDetails?.path ) {
		sendIpcEventToRendererWithWindow( parentWindow, 'theme-details-updating', { id } );
		const updatedSite = {
			...server.details,
			themeDetails,
		};
		sendIpcEventToRendererWithWindow( parentWindow, 'theme-details-changed', {
			id,
			details: themeDetails,
		} );

		void server
			.updateCachedThumbnail()
			.then( () => sendThumbnailChangedEvent( event, id ) )
			.catch( ( error ) => {
				console.error( `Failed to update thumbnail for server ${ id }:`, error );
			} );
		server.details.themeDetails = themeDetails;
		await updateSite( event, updatedSite );
	}
	return themeDetails;
}

export async function getOnboardingData( _event: IpcMainInvokeEvent ): Promise< boolean > {
	const userData = await loadUserData();
	const { onboardingCompleted = false } = userData;
	return onboardingCompleted;
}

export async function saveOnboarding( event: IpcMainInvokeEvent, onboardingCompleted: boolean ) {
	await updateAppdata( { onboardingCompleted } );
}

export async function getBetaFeatures( _event: IpcMainInvokeEvent ): Promise< BetaFeatures > {
	return await getBetaFeaturesFromLib();
}

export async function executeWPCLiInline(
	_event: IpcMainInvokeEvent,
	{
		siteId,
		args,
		skipPluginsAndThemes = false,
	}: {
		siteId: string;
		args: string;
		skipPluginsAndThemes?: boolean;
	}
): Promise< WpCliResult > {
	if ( SiteServer.isDeleted( siteId ) ) {
		return {
			stdout: '',
			stderr: `Cannot execute command on deleted site ${ siteId }`,
			exitCode: 1,
		};
	}
	const server = SiteServer.get( siteId );
	if ( ! server ) {
		throw new Error( 'Site not found.' );
	}
	return server.executeWpCliCommand( args, {
		skipPluginsAndThemes,
	} );
}

export function getThumbnailData( _event: IpcMainInvokeEvent, id: string ) {
	const path = getSiteThumbnailPath( id );
	return getImageData( path );
}

function promiseExec( command: string, options: ExecOptions = {} ): Promise< void > {
	return new Promise( ( resolve, reject ) => {
		exec( command, options, ( error ) => {
			if ( error ) {
				reject( error );
				return;
			}
			resolve();
		} );
	} );
}

export async function openTerminalAtPath( _event: IpcMainInvokeEvent, targetPath: string ) {
	const platform = process.platform;

	const preferredTerminal = await getUserTerminal();

	if ( platform === 'darwin' ) {
		const escapedPath = targetPath.replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' );
		const bundleIds = {
			warp: 'dev.warp.Warp-Stable',
			ghostty: 'com.mitchellh.ghostty',
			iterm: 'com.googlecode.iterm2',
			terminal: 'com.apple.Terminal',
		};
		return promiseExec( `open -b ${ bundleIds[ preferredTerminal ] } "${ escapedPath }"` );
	} else if ( platform === 'win32' ) {
		const userData = await loadUserData();
		const preferredTerminal = userData.preferredTerminal;
		const defaultShell = process.env.ComSpec || 'cmd.exe';

		if ( preferredTerminal === 'warp' ) {
			const encodedPath = encodeURIComponent( targetPath );
			return promiseExec( `start "" "warp://action/new_tab?path=${ encodedPath }"` );
		}

		return promiseExec( `start "Command Prompt" ${ defaultShell }`, {
			cwd: targetPath,
		} );
	} else if ( platform === 'linux' ) {
		return promiseExec( `gnome-terminal --working-directory=${ targetPath }` );
	} else {
		console.error( 'Unsupported platform:', platform );
		return;
	}
}

export async function openAppAtPath(
	event: IpcMainInvokeEvent,
	editorKey: SupportedEditor,
	filePath: string
): Promise< void > {
	const platform = process.platform;
	const editor = supportedEditorConfig[ editorKey ];

	if ( platform === 'darwin' ) {
		return promiseExec( `open -b ${ editor.macOSBundleId } "${ filePath }"` );
	}

	if ( platform === 'win32' ) {
		const editorPath = await winFindEditorPath( editorKey );
		if ( ! editorPath ) {
			// Fall back to using openURL if no editor path is found
			return openURL( event, editor.url( filePath ) );
		}

		return promiseExec( `"${ editorPath }" "${ filePath }"` );
	}

	throw new Error( `Platform ${ platform } is not supported` );
}

export function showMessageBox( event: IpcMainInvokeEvent, options: Electron.MessageBoxOptions ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( parentWindow && ! parentWindow.isDestroyed() && ! event.sender.isDestroyed() ) {
		return dialog.showMessageBox( parentWindow, options );
	}
	return dialog.showMessageBox( options );
}

export async function showErrorMessageBox(
	event: IpcMainInvokeEvent,
	{
		title,
		message,
		error,
		showOpenLogs = false,
	}: { title: string; message: string; error?: unknown; showOpenLogs?: boolean }
) {
	const simplifiedError = simplifyErrorForDisplay( error );
	// Remove prepended error message added by IPC handler
	const filteredError = ( simplifiedError as Error )?.message?.replace(
		/Error invoking remote method '\w+': Error:/g,
		''
	);
	const response = await showMessageBox( event, {
		type: 'error',
		message: title,
		detail: error ? `${ message }\n\n${ filteredError }` : message,
		buttons: [ ...( showOpenLogs ? [ __( 'Open Studio Logs' ) ] : [] ), __( 'OK' ) ],
	} );

	if ( showOpenLogs && response.response === 0 ) {
		const logFilePath = getLogsFilePath();
		const err = await shell.openPath( logFilePath );
		if ( err ) {
			console.error( `Error opening logs file: ${ logFilePath } ${ err }` );
		}
	}
}

export function showNotification(
	_event: IpcMainInvokeEvent,
	options: Electron.NotificationConstructorOptions
) {
	new Notification( options ).show();
}

export async function setupAppMenu(
	_event: IpcMainInvokeEvent,
	config: { needsOnboarding: boolean; isAddSiteVisible?: boolean }
) {
	await setupMenu( config );
}

export async function popupAppMenu( _event: IpcMainInvokeEvent ) {
	await popupMenu();
}

export async function promptWindowsSpeedUpSites(
	_event: IpcMainInvokeEvent,
	{ skipIfAlreadyPrompted }: { skipIfAlreadyPrompted: boolean }
) {
	await windowsHelpers.promptWindowsSpeedUpSites( { skipIfAlreadyPrompted } );
}

export function setDefaultLocaleData( _event: IpcMainInvokeEvent, locale?: LocaleData ) {
	defaultI18n.setLocaleData( locale );
}

export function resetDefaultLocaleData( _event: IpcMainInvokeEvent ) {
	defaultI18n.resetLocaleData();
}

export function toggleMinWindowWidth( event: IpcMainInvokeEvent, isSidebarVisible: boolean ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( ! parentWindow || parentWindow.isDestroyed() || event.sender.isDestroyed() ) {
		return;
	}
	const [ currentWidth, currentHeight ] = parentWindow.getSize();
	const newWidth = Math.max(
		MAIN_MIN_WIDTH,
		isSidebarVisible ? currentWidth - SIDEBAR_WIDTH : currentWidth + SIDEBAR_WIDTH
	);
	parentWindow.setSize( newWidth, currentHeight, true );
}

/**
 * Returns the absolute path of a file in the site's directory.
 * Returns null if the file does not exist.
 */
export async function getAbsolutePathFromSite(
	_event: IpcMainInvokeEvent,
	siteId: string,
	relativePath: string
): Promise< string | null > {
	const server = SiteServer.get( siteId );
	if ( ! server ) {
		throw new Error( 'Site not found.' );
	}

	const path = nodePath.join( server.details.path, relativePath );
	return ( await pathExists( path ) ) ? path : null;
}

/**
 * Opens a file in the IDE with the site context.
 */
export async function openFileInIDE(
	_event: IpcMainInvokeEvent,
	relativePath: string,
	siteId: string
) {
	const server = SiteServer.get( siteId );
	if ( ! server ) {
		throw new Error( 'Site not found.' );
	}

	const path = await getAbsolutePathFromSite( _event, siteId, relativePath );
	if ( ! path ) {
		return;
	}

	if ( isInstalled( 'vscode' ) ) {
		// Open site first to ensure the file is opened within the site context
		await shellOpenExternalWrapper( `vscode://file/${ server.details.path }?windowId=_blank` );
		await shellOpenExternalWrapper( `vscode://file/${ path }` );
	} else if ( isInstalled( 'phpstorm' ) ) {
		// Open site first to ensure the file is opened within the site context
		await shellOpenExternalWrapper( `phpstorm://open?file=${ path }` );
	}
}

export async function isImportExportSupported( _event: IpcMainInvokeEvent, siteId: string ) {
	const site = SiteServer.get( siteId );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	return site.hasSQLitePlugin();
}

export function getDirectorySize( _event: IpcMainInvokeEvent, siteId: string, subdir: string[] ) {
	const site = SiteServer.get( siteId );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	return calculateDirectorySize( nodePath.join( site.details.path, ...subdir ) );
}

export function getFileSize( _event: IpcMainInvokeEvent, siteId: string, filePath: string[] ) {
	const site = SiteServer.get( siteId );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	return fs.statSync( nodePath.join( site.details.path, ...filePath ) ).size;
}

export function openCertificate( _event: IpcMainInvokeEvent ) {
	return openCertificateDialog();
}

export async function isCATrusted(): Promise< boolean > {
	return isRootCATrusted();
}

export async function trustCertificate( event: IpcMainInvokeEvent ): Promise< void > {
	const platform = process.platform;
	if ( platform === 'win32' ) {
		try {
			await trustRootCA();
		} catch ( error ) {
			await showErrorMessageBox( event, {
				title: __( 'Certificate Trust Failed' ),
				message: __(
					'Studio was unable to trust the certificate automatically. You may need to trust it manually using certificate manager.'
				),
				showOpenLogs: true,
			} );
		}
	} else {
		await openCertificateDialog();
	}
}

export function showSiteContextMenu(
	event: IpcMainInvokeEvent,
	context: {
		siteId: string;
		isRunning: boolean;
		isLoading: boolean;
		isAddingSite: boolean;
		finderLabel: string;
		editorLabel: string | null;
		terminalLabel: string;
	}
) {
	const { siteId, isRunning, isLoading, isAddingSite, finderLabel, editorLabel, terminalLabel } =
		context;
	const menu = new Menu();

	if ( isRunning ) {
		menu.append(
			new MenuItem( {
				label: __( 'Stop' ),
				enabled: ! isAddingSite,
				click: () => {
					sendIpcEventToRendererWithWindow(
						BrowserWindow.fromWebContents( event.sender ),
						'site-context-menu-action',
						{
							action: 'stop',
							siteId,
						}
					);
				},
			} )
		);
	} else {
		menu.append(
			new MenuItem( {
				label: __( 'Start' ),
				enabled: ! isLoading && ! isAddingSite,
				click: () => {
					sendIpcEventToRendererWithWindow(
						BrowserWindow.fromWebContents( event.sender ),
						'site-context-menu-action',
						{
							action: 'start',
							siteId,
						}
					);
				},
			} )
		);
	}

	menu.append( new MenuItem( { type: 'separator' } ) );

	menu.append(
		new MenuItem( {
			label: __( 'Open site' ),
			enabled: ! isLoading && ! isAddingSite,
			click: () => {
				sendIpcEventToRendererWithWindow(
					BrowserWindow.fromWebContents( event.sender ),
					'site-context-menu-action',
					{
						action: 'open-site',
						siteId,
					}
				);
			},
		} )
	);

	menu.append(
		new MenuItem( {
			label: __( 'WP admin' ),
			enabled: ! isLoading && ! isAddingSite,
			click: () => {
				sendIpcEventToRendererWithWindow(
					BrowserWindow.fromWebContents( event.sender ),
					'site-context-menu-action',
					{
						action: 'open-admin',
						siteId,
					}
				);
			},
		} )
	);

	menu.append( new MenuItem( { type: 'separator' } ) );

	menu.append(
		new MenuItem( {
			label: sprintf(
				/* translators: %s is the name of the file explorer. E.g. "Open in Finder" */
				__( 'Open in %s' ),
				finderLabel
			),
			enabled: ! isAddingSite,
			click: () => {
				sendIpcEventToRendererWithWindow(
					BrowserWindow.fromWebContents( event.sender ),
					'site-context-menu-action',
					{
						action: 'open-finder',
						siteId,
					}
				);
			},
		} )
	);

	if ( editorLabel ) {
		menu.append(
			new MenuItem( {
				label: sprintf(
					/* translators: %s is the name of the editor. E.g. "Open in Cursor" */
					__( 'Open in %s' ),
					editorLabel
				),
				enabled: ! isAddingSite,
				click: () => {
					sendIpcEventToRendererWithWindow(
						BrowserWindow.fromWebContents( event.sender ),
						'site-context-menu-action',
						{
							action: 'open-editor',
							siteId,
						}
					);
				},
			} )
		);
	}

	menu.append(
		new MenuItem( {
			label: sprintf(
				/* translators: %s is the name of the terminal. E.g. "Open in Terminal" */
				__( 'Open in %s' ),
				terminalLabel
			),
			enabled: ! isAddingSite,
			click: () => {
				sendIpcEventToRendererWithWindow(
					BrowserWindow.fromWebContents( event.sender ),
					'site-context-menu-action',
					{
						action: 'open-terminal',
						siteId,
					}
				);
			},
		} )
	);

	menu.append( new MenuItem( { type: 'separator' } ) );

	menu.append(
		new MenuItem( {
			label: __( 'Edit site…' ),
			enabled: ! isAddingSite,
			click: () => {
				sendIpcEventToRendererWithWindow(
					BrowserWindow.fromWebContents( event.sender ),
					'site-context-menu-action',
					{
						action: 'edit-site',
						siteId,
					}
				);
			},
		} )
	);

	menu.append(
		new MenuItem( {
			label: __( 'Delete site…' ),
			enabled: ! isLoading && ! isAddingSite,
			click: () => {
				sendIpcEventToRendererWithWindow(
					BrowserWindow.fromWebContents( event.sender ),
					'site-context-menu-action',
					{
						action: 'delete',
						siteId,
					}
				);
			},
		} )
	);

	const window = BrowserWindow.fromWebContents( event.sender );
	if ( window ) {
		menu.popup( { window } );
	}
}

/**
 * Checks the size of a sync backup file before downloading.
 * Returns the size in bytes.
 */
export async function checkSyncBackupSize(
	event: IpcMainInvokeEvent,
	downloadUrl: string
): Promise< number > {
	return new Promise( ( resolve, reject ) => {
		https
			.get( downloadUrl, { method: 'HEAD' }, ( res ) => {
				if ( res.statusCode !== 200 ) {
					reject( new Error( `Failed to fetch file size: ${ res.statusMessage }` ) );
					return;
				}

				const contentLength = res.headers[ 'content-length' ];
				if ( ! contentLength ) {
					reject( new Error( 'Content-Length header not found' ) );
					return;
				}

				resolve( parseInt( contentLength, 10 ) );
			} )
			.on( 'error', ( error: Error ) => {
				Sentry.captureException( error );
				reject( new Error( `Failed to check backup file size: ${ error.message }` ) );
			} );
	} );
}

export async function isFullscreen( _event: IpcMainInvokeEvent ): Promise< boolean > {
	const window = await getMainWindow();
	return window.isFullScreen();
}

export async function getAllCustomDomains(): Promise< string[] > {
	const userData = await loadUserData();

	return userData.sites
		.map( ( site ) => site.customDomain )
		.filter( ( domain ): domain is string => domain !== undefined );
}

export function comparePaths( event: IpcMainInvokeEvent, path1: string, path2: string ) {
	return arePathsEqual( path1, path2 );
}

export async function listLocalFileTree(
	_event: Electron.IpcMainInvokeEvent,
	siteId: string,
	path: string,
	maxDepth: number = 3,
	currentDepth: number = 0
): Promise< RawDirectoryEntry[] > {
	const server = SiteServer.get( siteId );
	if ( ! server ) throw new Error( 'Site not found' );

	const fullPath = nodePath.join( server.details.path, path );

	try {
		const entries = await fs.promises.readdir( fullPath, { withFileTypes: true } );
		const result = [];

		for ( const entry of entries ) {
			if ( shouldExcludeFromSync( entry.name ) ) {
				continue;
			}

			const isDirectory = entry.isDirectory();
			const itemPath = nodePath.join( path, entry.name ).replace( /\\/g, '/' );

			const directoryEntry: RawDirectoryEntry = {
				name: entry.name,
				isDirectory,
				path: itemPath,
			};

			const shouldLimit = shouldLimitDepth( itemPath );
			if ( isDirectory && currentDepth < maxDepth && ! shouldLimit ) {
				try {
					directoryEntry.children = await listLocalFileTree(
						_event,
						siteId,
						itemPath,
						maxDepth,
						currentDepth + 1
					);
				} catch ( childErr ) {
					console.warn( `Failed to load children for ${ itemPath }:`, childErr );
					directoryEntry.children = [];
				}
			}

			result.push( directoryEntry );
		}

		return result;
	} catch ( err ) {
		console.error( `Failed to list raw file tree for path ${ path }:`, err );
		return [];
	}
}

export async function getProviderConstants( _event: IpcMainInvokeEvent ) {
	const provider = getWordPressProvider();
	return getProviderConstantsFromProvider( provider );
}

export async function validateBlueprint(
	_event: IpcMainInvokeEvent,
	blueprintJson: Blueprint[ 'blueprint' ]
) {
	return validateBlueprintData( blueprintJson );
}

export async function readBlueprintFile(
	_event: IpcMainInvokeEvent,
	filePath: string
): Promise< Blueprint[ 'blueprint' ] > {
	const allowedDir = nodePath.join( app.getPath( 'temp' ), 'wp-studio-blueprints' );
	const resolvedPath = nodePath.resolve( filePath );

	const normalizedAllowedDir = nodePath.resolve( allowedDir );
	if ( ! resolvedPath.startsWith( normalizedAllowedDir + nodePath.sep ) ) {
		throw new Error( 'Blueprint file path must be within the allowed directory' );
	}

	const fileContents = await fsPromises.readFile( resolvedPath, 'utf-8' );
	return JSON.parse( fileContents );
}

export async function setWindowControlVisibility( event: IpcMainInvokeEvent, visible: boolean ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( parentWindow && process.platform === 'darwin' ) {
		parentWindow.setWindowButtonVisibility( visible );
	}
}

export async function validateRepositoryPath(
	_event: IpcMainInvokeEvent,
	repositoryPath: string
): Promise< { valid: boolean; error?: string; path?: string } > {
	try {
		// Check if path exists
		if ( ! fs.existsSync( repositoryPath ) ) {
			return {
				valid: false,
				error: __( 'Path does not exist. Please check the path and try again.' ),
			};
		}

		// Check if it's a directory
		const stats = fs.statSync( repositoryPath );
		if ( ! stats.isDirectory() ) {
			return {
				valid: false,
				error: __( 'Path is not a directory. Please provide the path to the repository folder.' ),
			};
		}

		// Check if product-packages directory exists (for all-plugins repo)
		const productPackagesPath = nodePath.join( repositoryPath, 'product-packages' );
		if ( ! fs.existsSync( productPackagesPath ) ) {
			return {
				valid: false,
				error: __(
					'Repository does not contain a "product-packages" directory. Please ensure this is the correct all-plugins repository.'
				),
			};
		}

		// Check if it's a git repository (optional but recommended)
		const gitPath = nodePath.join( repositoryPath, '.git' );
		if ( ! fs.existsSync( gitPath ) ) {
			writeLogToFile(
				'warn',
				`Repository path ${ repositoryPath } does not appear to be a git repository`
			);
			// Don't fail validation, but log a warning
		}

		return {
			valid: true,
			path: repositoryPath,
		};
	} catch ( error ) {
		const errorMessage = error instanceof Error ? error.message : String( error );
		writeLogToFile( 'erro', `Error validating repository path: ${ errorMessage }` );
		return {
			valid: false,
			error: sprintf( __( 'Error validating path: %s' ), errorMessage ),
		};
	}
}

export async function saveRepositoryPath(
	_event: IpcMainInvokeEvent,
	repositoryPath: string
): Promise< { success: boolean; error?: string } > {
	try {
		const userData = await loadUserData();
		await saveUserData( {
			...userData,
			allPluginsRepositoryPath: repositoryPath || undefined,
		} );

		writeLogToFile( 'info', `Saved repository path: ${ repositoryPath }` );
		const window = BrowserWindow.fromWebContents( _event.sender );
		sendIpcEventToRendererWithWindow( window, 'repository-path-saved', { success: true } );
		return { success: true };
	} catch ( error ) {
		const errorMessage = error instanceof Error ? error.message : String( error );
		writeLogToFile( 'erro', `Error saving repository path: ${ errorMessage }` );
		const window = BrowserWindow.fromWebContents( _event.sender );
		sendIpcEventToRendererWithWindow( window, 'repository-path-saved', {
			success: false,
			error: errorMessage,
		} );
		return {
			success: false,
			error: String( error ),
		};
	}
}

export async function getRepositoryPath(
	_event: IpcMainInvokeEvent
): Promise< { configured: boolean; path: string | null } > {
	const userData = await loadUserData();
	const repositoryPath = userData.allPluginsRepositoryPath;
	return {
		configured: !! repositoryPath,
		path: repositoryPath || null,
	};
}

export async function installPluginFromLocalRepo(
	_event: IpcMainInvokeEvent,
	options: {
		siteId: string;
		repositoryPath: string;
		pluginName: string;
	}
): Promise< { success: boolean; error?: string } > {
	try {
		const { siteId, repositoryPath, pluginName } = options;

		// Validate repository path exists
		if ( ! fs.existsSync( repositoryPath ) ) {
			return {
				success: false,
				error: __( 'Repository path does not exist' ),
			};
		}

		// Construct path to plugin zip file
		const pluginZipPath = nodePath.join(
			repositoryPath,
			'product-packages',
			pluginName,
			`${ pluginName }.zip`
		);

		if ( ! fs.existsSync( pluginZipPath ) ) {
			return {
				success: false,
				error: sprintf(
					__( 'Plugin zip file not found at %s. Please ensure the repository is up to date.' ),
					pluginZipPath
				),
			};
		}

		// Get site details
		const userData = await loadUserData();
		const site = userData.sites.find( ( s ) => s.id === siteId );
		if ( ! site ) {
			return {
				success: false,
				error: __( 'Site not found' ),
			};
		}

		// Install plugin using WP-CLI
		const server = SiteServer.get( siteId );
		if ( ! server ) {
			return {
				success: false,
				error: __( 'Site not found' ),
			};
		}

		// Copy zip file to site's filesystem so WP-CLI can access it
		// WP-CLI runs in PHP WASM which can't access host filesystem paths directly
		const sitePath = server.details.path;
		const tempZipName = `temp-plugin-${ pluginName }-${ Date.now() }.zip`;
		const tempZipPath = nodePath.join( sitePath, tempZipName );

		try {
			// Copy the zip file to the site's root directory
			await fsPromises.copyFile( pluginZipPath, tempZipPath );

			// Use relative path from WordPress root for WP-CLI
			const result = await server.executeWpCliCommand(
				`plugin install "${ tempZipName }" --activate --force`
			);

			// Clean up temp file
			try {
				await fsPromises.unlink( tempZipPath );
			} catch ( cleanupError ) {
				// Log but don't fail if cleanup fails
				writeLogToFile( 'warn', `Failed to cleanup temp zip file: ${ tempZipPath }` );
			}

			if ( result.exitCode === 0 ) {
				return { success: true };
			} else {
				return {
					success: false,
					error: result.stderr || __( 'Failed to install plugin' ),
				};
			}
		} catch ( copyError ) {
			// Clean up temp file if copy failed
			try {
				if ( await pathExists( tempZipPath ) ) {
					await fsPromises.unlink( tempZipPath );
				}
			} catch {
				// Ignore cleanup errors
			}

			const errorMessage =
				copyError instanceof Error ? copyError.message : String( copyError );
			return {
				success: false,
				error: sprintf( __( 'Failed to copy plugin zip file: %s' ), errorMessage ),
			};
		}
	} catch ( error ) {
		const errorMessage = error instanceof Error ? error.message : String( error );
		writeLogToFile( 'erro', `Error installing plugin from local repo: ${ errorMessage }` );
		return {
			success: false,
			error: errorMessage,
		};
	}
}

export async function importWooCommerceBlueprint(
	_event: IpcMainInvokeEvent,
	options: {
		siteId: string;
		blueprintPath: string;
		githubToken?: string;
	}
): Promise< {
	success: boolean;
	results?: Array< { step: string; success: boolean; message: string } >;
	error?: string;
} > {
	try {
		const { siteId, blueprintPath } = options;

		// Get site server
		const server = SiteServer.get( siteId );
		if ( ! server ) {
			return {
				success: false,
				error: __( 'Site not found' ),
			};
		}

		// Ensure site is running
		if ( ! server.details.running ) {
			await startServer( _event, server.details.id );
		}

		// Read blueprint file
		const blueprintContent = await getFileContent( _event, blueprintPath );
		const blueprint = JSON.parse( blueprintContent ) as {
			steps: Array< {
				step: string;
				pluginData?: { resource: string; slug: string };
				themeData?: { resource: string; slug: string };
				options?: Record< string, unknown >;
				sql?: { resource: string; name?: string; contents?: string };
			} >;
		};

		if ( ! blueprint.steps || ! Array.isArray( blueprint.steps ) ) {
			return {
				success: false,
				error: __( 'Invalid blueprint format: missing or invalid steps array' ),
			};
		}

		const results: Array< { step: string; success: boolean; message: string } > = [];
		const userData = await loadUserData();
		const repositoryPath = userData.allPluginsRepositoryPath;

		// Execute each step
		for ( const step of blueprint.steps ) {
			try {
				switch ( step.step ) {
					case 'installPlugin': {
						if ( ! step.pluginData ) {
							results.push( {
								step: 'installPlugin',
								success: false,
								message: __( 'Missing plugin data' ),
							} );
							continue;
						}

						const pluginSlug = step.pluginData.slug;
						const isPremium = step.pluginData.resource?.includes( 'github.com' ) || false;
						let installSuccess = false;

						if ( isPremium && repositoryPath ) {
							// Install from local repository
							const installResult = await installPluginFromLocalRepo( _event, {
								siteId,
								repositoryPath,
								pluginName: pluginSlug,
							} );

							installSuccess = installResult.success;
							results.push( {
								step: `installPlugin:${ pluginSlug }`,
								success: installResult.success,
								message: installResult.success
									? sprintf( __( 'Installed %s' ), pluginSlug )
									: installResult.error || __( 'Failed to install plugin' ),
							} );
						} else {
							// Install from WordPress.org
							// For WooCommerce, don't skip plugins during activation so activation hooks run
							const skipPlugins = pluginSlug === 'woocommerce' ? false : true;
							const wpCliResult = await server.executeWpCliCommand(
								`plugin install ${ pluginSlug } --activate`,
								{ skipPluginsAndThemes: skipPlugins }
							);

							installSuccess = wpCliResult.exitCode === 0;
							results.push( {
								step: `installPlugin:${ pluginSlug }`,
								success: wpCliResult.exitCode === 0,
								message:
									wpCliResult.exitCode === 0
										? sprintf( __( 'Installed %s' ), pluginSlug )
										: wpCliResult.stderr || __( 'Failed to install plugin' ),
							} );
						}

						// If WooCommerce was successfully installed, trigger database setup
						if ( installSuccess && pluginSlug === 'woocommerce' ) {
							try {
								// Trigger WooCommerce database installation manually using PHP
								// Load WooCommerce and trigger database creation
								const dbSetupPhpCode = `<?php
// Load WordPress
require_once 'wp-load.php';

// Manually load WooCommerce plugin file
$woocommerce_file = WP_PLUGIN_DIR . '/woocommerce/woocommerce.php';
if ( ! file_exists( $woocommerce_file ) ) {
	echo 'WooCommerce plugin file not found at: ' . $woocommerce_file;
	exit( 1 );
}

// Include WooCommerce main file
include_once $woocommerce_file;

// Check if WC_Install class exists
if ( ! class_exists( 'WC_Install' ) ) {
	echo 'WC_Install class not found. WooCommerce may not be properly installed.';
	exit( 1 );
}

// Create WooCommerce database tables
try {
	WC_Install::create_tables();
	WC_Install::create_roles();
	
	// Get WooCommerce version and update database version option
	if ( function_exists( 'WC' ) ) {
		$wc = WC();
		if ( is_object( $wc ) && property_exists( $wc, 'version' ) ) {
			update_option( 'woocommerce_db_version', $wc->version );
		}
	}
	
	echo 'WooCommerce database tables created successfully';
} catch ( Exception $e ) {
	echo 'Error creating WooCommerce tables: ' . $e->getMessage();
	exit( 1 );
}
`;

								// Write PHP code to temp file
								const tempPhpFileName = `woo_db_setup_${ Date.now() }.php`;
								const tempPhpPath = nodePath.join( server.details.path, tempPhpFileName );
								await fsPromises.writeFile( tempPhpPath, dbSetupPhpCode, 'utf-8' );

								try {
									// Execute the PHP file using wp eval
									// Don't skip plugins so WooCommerce can load properly
									const evalCommand = `eval 'require "${ tempPhpFileName }";'`;
									const wcUpdateResult = await server.executeWpCliCommand(
										evalCommand,
										{ skipPluginsAndThemes: false }
									);

									if ( wcUpdateResult.exitCode === 0 ) {
										results.push( {
											step: 'woocommerce_db_setup',
											success: true,
											message: __( 'WooCommerce database tables created' ),
										} );
									} else {
										// Log warning but don't fail the import
										const errorMsg = [ wcUpdateResult.stderr, wcUpdateResult.stdout ]
											.filter( ( msg ) => msg && msg.trim() )
											.join( ' | ' ) || __( 'Unknown error' );
										results.push( {
											step: 'woocommerce_db_setup',
											success: false,
											message: sprintf( __( 'WooCommerce database update warning: %s' ), errorMsg ),
										} );
									}
								} finally {
									// Clean up PHP file
									try {
										if ( await pathExists( tempPhpPath ) ) {
											await fsPromises.unlink( tempPhpPath );
										}
									} catch ( cleanupError ) {
										writeLogToFile(
											'warn',
											`Failed to cleanup temp WooCommerce DB setup file: ${ tempPhpPath }`
										);
									}
								}
							} catch ( wcError ) {
								// Log error but don't fail the import
								results.push( {
									step: 'woocommerce_db_setup',
									success: false,
									message: sprintf(
										__( 'Failed to run WooCommerce database update: %s' ),
										wcError instanceof Error ? wcError.message : String( wcError )
									),
								} );
							}
						}
						break;
					}

					case 'installTheme': {
						if ( ! step.themeData ) {
							results.push( {
								step: 'installTheme',
								success: false,
								message: __( 'Missing theme data' ),
							} );
							continue;
						}

						const themeSlug = step.themeData.slug;
						const wpCliResult = await server.executeWpCliCommand(
							`theme install ${ themeSlug } --activate`
						);

						results.push( {
							step: `installTheme:${ themeSlug }`,
							success: wpCliResult.exitCode === 0,
							message:
								wpCliResult.exitCode === 0
									? sprintf( __( 'Installed theme %s' ), themeSlug )
									: wpCliResult.stderr || __( 'Failed to install theme' ),
						} );
						break;
					}

					case 'setSiteOptions': {
						if ( ! step.options ) {
							results.push( {
								step: 'setSiteOptions',
								success: false,
								message: __( 'Missing options data' ),
							} );
							continue;
						}

						const optionEntries = Object.entries( step.options );
						const optionResults: string[] = [];

						for ( const [ key, value ] of optionEntries ) {
							try {
								// For complex values (objects/arrays), write to temp file and use wp eval
								// This completely avoids shell escaping issues that can crash PHP
								if ( typeof value === 'object' && value !== null ) {
									// Write JSON to temporary file in site's filesystem
									const tempJsonFileName = `woo-blueprint-option-${ key.replace( /[^a-zA-Z0-9]/g, '_' ) }-${ Date.now() }.json`;
									const tempJsonPath = nodePath.join( server.details.path, tempJsonFileName );
									const jsonValue = JSON.stringify( value );
									await fsPromises.writeFile( tempJsonPath, jsonValue, 'utf-8' );

									try {
										// Verify the file was written correctly
										if ( ! ( await pathExists( tempJsonPath ) ) ) {
											throw new Error( __( 'Failed to create temporary JSON file' ) );
										}

										// Write PHP code to a temporary file to avoid shell escaping issues
										// Use a simple filename with only alphanumeric characters and underscores to avoid escaping issues
										const safeKey = key.replace( /[^a-zA-Z0-9]/g, '_' );
										const timestamp = Date.now();
										const tempPhpFileName = `woo_blueprint_option_${ safeKey }_${ timestamp }.php`;
										const tempPhpPath = nodePath.join( server.details.path, tempPhpFileName );
										
										// Build PHP code that reads the JSON file and sets the option
										// Escape the option key and filename for use in PHP code
										const escapedKey = key.replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" );
										const escapedFileName = tempJsonFileName.replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" );
										
										const phpCode = `<?php
$f = '${ escapedFileName }';
if ( ! file_exists( $f ) ) {
	echo 'File not found: ' . $f;
	exit( 1 );
}
$j = file_get_contents( $f );
if ( $j === false ) {
	echo 'Failed to read file: ' . $f;
	exit( 1 );
}
$v = json_decode( $j, true );
$err = json_last_error();
if ( $err !== JSON_ERROR_NONE ) {
	echo 'JSON decode error (' . $err . '): ' . json_last_error_msg() . ' | File: ' . $f . ' | Content length: ' . strlen( $j );
	exit( 1 );
}
update_option( '${ escapedKey }', $v );
echo 'Success';
if ( file_exists( $f ) ) {
	unlink( $f );
}
if ( file_exists( __FILE__ ) ) {
	unlink( __FILE__ );
}
`;
										
										// Write PHP file to site's filesystem
										await fsPromises.writeFile( tempPhpPath, phpCode, 'utf-8' );

										try {
											// Execute the PHP file using wp eval with require
											// The filename is safe (only alphanumeric and underscores), so we can use it directly
											// Use single quotes for the outer eval command to avoid shell interpretation
											const evalCommand = `eval 'require "${ tempPhpFileName }";'`;
											
											const wpCliResult = await server.executeWpCliCommand(
												evalCommand,
												{ skipPluginsAndThemes: true }
											);

											if ( wpCliResult.exitCode === 0 ) {
												optionResults.push( sprintf( __( 'Set %s' ), key ) );
											} else {
												// Include both stderr and stdout in error message for debugging
												const errorMsg = [ wpCliResult.stderr, wpCliResult.stdout ]
													.filter( ( msg ) => msg && msg.trim() )
													.join( ' | ' ) || __( 'Unknown error' );
												optionResults.push(
													sprintf( __( 'Failed to set %s: %s' ), key, errorMsg )
												);
											}
										} finally {
											// Clean up PHP file if it still exists (it should delete itself, but just in case)
											try {
												if ( await pathExists( tempPhpPath ) ) {
													await fsPromises.unlink( tempPhpPath );
												}
											} catch ( cleanupError ) {
												writeLogToFile(
													'warn',
													`Failed to cleanup temp PHP file: ${ tempPhpPath }`
												);
											}
										}
									} catch ( evalError ) {
										// Clean up temp file on error
										try {
											if ( await pathExists( tempJsonPath ) ) {
												await fsPromises.unlink( tempJsonPath );
											}
										} catch {
											// Ignore cleanup errors
										}
										optionResults.push(
											sprintf( __( 'Failed to set %s: %s' ), key, evalError instanceof Error ? evalError.message : String( evalError ) )
										);
									}
								} else {
									// For simple values (strings, numbers, booleans), use direct command
									let valueArg: string;
									if ( typeof value === 'string' ) {
										// Escape single quotes for shell
										valueArg = `'${ value.replace( /'/g, "'\\''" ) }'`;
									} else {
										// For numbers, booleans, etc., convert to string
										valueArg = String( value );
									}

									const wpCliResult = await server.executeWpCliCommand(
										`option update ${ key } ${ valueArg }`,
										{ skipPluginsAndThemes: true }
									);

									if ( wpCliResult.exitCode === 0 ) {
										optionResults.push( sprintf( __( 'Set %s' ), key ) );
									} else {
										optionResults.push(
											sprintf( __( 'Failed to set %s: %s' ), key, wpCliResult.stderr || '' )
										);
									}
								}
							} catch ( optionError ) {
								optionResults.push(
									sprintf( __( 'Failed to set %s: %s' ), key, optionError instanceof Error ? optionError.message : String( optionError ) )
								);
							}
						}

						results.push( {
							step: 'setSiteOptions',
							success: optionResults.every( ( r ) => ! r.includes( 'Failed' ) ),
							message: optionResults.join( ', ' ),
						} );
						break;
					}

					case 'runSql': {
						if ( ! step.sql ) {
							results.push( {
								step: 'runSql',
								success: false,
								message: __( 'Missing SQL data' ),
							} );
							continue;
						}

						const sqlQuery = step.sql.contents || step.sql.resource || '';
						if ( ! sqlQuery ) {
							results.push( {
								step: 'runSql',
								success: false,
								message: __( 'Empty SQL query' ),
							} );
							continue;
						}

						// Convert MySQL syntax to SQLite-compatible syntax
						// This converts REPLACE INTO to INSERT OR REPLACE INTO, etc.
						const convertedSql = convertMySqlToSqlite( sqlQuery );

						// Write SQL to temporary file and import using sqlite import
						// This is safer than using db query with string escaping
						const sqlTempFileName = `woo-blueprint-sql-${ Date.now() }.sql`;
						const sqlTempFilePath = nodePath.join( server.details.path, sqlTempFileName );

						try {
							// Write converted SQL query to temp file
							await fsPromises.writeFile( sqlTempFilePath, convertedSql, 'utf-8' );

							// Import using sqlite import with --skip-plugins and --skip-themes
							// to avoid plugin errors during SQL execution
							const wpCliResult = await server.executeWpCliCommand(
								`sqlite import ${ sqlTempFileName } --require=/tmp/sqlite-command/command.php --enable-ast-driver`,
								{
									targetPhpVersion: getWordPressProvider().DEFAULT_PHP_VERSION,
									skipPluginsAndThemes: true,
								}
							);

							results.push( {
								step: 'runSql',
								success: wpCliResult.exitCode === 0,
								message:
									wpCliResult.exitCode === 0
										? __( 'SQL query executed successfully' )
										: wpCliResult.stderr || __( 'Failed to execute SQL query' ),
							} );
						} catch ( sqlError ) {
							results.push( {
								step: 'runSql',
								success: false,
								message:
									sqlError instanceof Error
										? sqlError.message
										: __( 'Failed to execute SQL query' ),
							} );
						} finally {
							// Clean up temp SQL file
							try {
								if ( await pathExists( sqlTempFilePath ) ) {
									await fsPromises.unlink( sqlTempFilePath );
								}
							} catch ( cleanupError ) {
								// Log but don't fail if cleanup fails
								writeLogToFile(
									'warn',
									`Failed to cleanup temp SQL file: ${ sqlTempFilePath }`
								);
							}
						}
						break;
					}

					default:
						results.push( {
							step: step.step,
							success: false,
							message: sprintf( __( 'Unknown step type: %s' ), step.step ),
						} );
				}
			} catch ( stepError ) {
				results.push( {
					step: step.step,
					success: false,
					message:
						stepError instanceof Error
							? stepError.message
							: sprintf( __( 'Error executing step: %s' ), String( stepError ) ),
				} );
			}
		}

		const allSuccessful = results.every( ( r ) => r.success );

		// Restart the server to ensure clean state after blueprint import
		// This helps avoid issues where plugins or database changes break the site
		if ( server.details.running ) {
			try {
				writeLogToFile( 'info', 'Restarting server after Woo Blueprint import to ensure clean state' );
				await server.stop();
				// Small delay to ensure clean shutdown
				await new Promise( ( resolve ) => setTimeout( resolve, 1000 ) );
				await startServer( _event, server.details.id );
			} catch ( restartError ) {
				writeLogToFile(
					'warn',
					`Failed to restart server after blueprint import: ${
						restartError instanceof Error ? restartError.message : String( restartError )
					}`
				);
				// Don't fail the import if restart fails, but log it
			}
		}

		return {
			success: allSuccessful,
			results,
			error: allSuccessful ? undefined : __( 'Some steps failed during import' ),
		};
	} catch ( error ) {
		const errorMessage = error instanceof Error ? error.message : String( error );
		writeLogToFile( 'erro', `Error importing WooCommerce blueprint: ${ errorMessage }` );
		return {
			success: false,
			error: errorMessage,
		};
	}
}

export async function getAvailablePluginsFromRepository(
	_event: IpcMainInvokeEvent,
	repositoryPath: string
): Promise< { success: boolean; plugins?: Array< { name: string; label: string } >; error?: string } > {
	try {
		if ( ! fs.existsSync( repositoryPath ) ) {
			return {
				success: false,
				error: __( 'Repository path does not exist' ),
			};
		}

		const productPackagesPath = nodePath.join( repositoryPath, 'product-packages' );
		if ( ! fs.existsSync( productPackagesPath ) ) {
			return {
				success: false,
				error: __( 'Repository does not contain a "product-packages" directory' ),
			};
		}

		const entries = fs.readdirSync( productPackagesPath, { withFileTypes: true } );
		const plugins: Array< { name: string; label: string } > = [];

		for ( const entry of entries ) {
			if ( entry.isDirectory() ) {
				const pluginSlug = entry.name;
				const pluginZipPath = nodePath.join( productPackagesPath, pluginSlug, `${ pluginSlug }.zip` );

				if ( fs.existsSync( pluginZipPath ) ) {
					// Convert slug to label (e.g., "woocommerce-subscriptions" -> "WooCommerce Subscriptions")
					const label = pluginSlug
						.split( '-' )
						.map( ( word ) => word.charAt( 0 ).toUpperCase() + word.slice( 1 ) )
						.join( ' ' );

					plugins.push( {
						name: pluginSlug,
						label,
					} );
				}
			}
		}

		return {
			success: true,
			plugins,
		};
	} catch ( error ) {
		const errorMessage = error instanceof Error ? error.message : String( error );
		writeLogToFile( 'erro', `Error getting plugins from repository: ${ errorMessage }` );
		return {
			success: false,
			error: errorMessage,
		};
	}
}
