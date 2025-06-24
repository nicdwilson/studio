import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { Button, TextControl, Card, SelectControl } from '@wordpress/components';
import { useState, useEffect } from 'react';
import { getIpcApi } from 'src/lib/get-ipc-api';
import { useSiteDetails } from 'src/hooks/use-site-details';

interface PluginOption {
	label: string;
	value: string;
	type: 'public' | 'premium';
	repository?: string; // GitHub repository URL for premium plugins
}

const COMMON_WOOCOMMERCE_PLUGINS: PluginOption[] = [
	{ label: 'woocommerce', value: 'woocommerce', type: 'public' },
	{ label: 'woocommerce-payments', value: 'woocommerce-payments', type: 'public' },
	{ label: 'woocommerce-subscriptions', value: 'woocommerce-subscriptions', type: 'public' },
	{ label: 'woocommerce-bookings', value: 'woocommerce-bookings', type: 'public' },
	{ label: 'woocommerce-memberships', value: 'woocommerce-memberships', type: 'public' },
	{ label: 'woocommerce-product-bundles', value: 'woocommerce-product-bundles', type: 'public' },
	{ label: 'woocommerce-composite-products', value: 'woocommerce-composite-products', type: 'public' },
	{ label: 'woocommerce-min-max-quantities', value: 'woocommerce-min-max-quantities', type: 'public' },
	{ label: 'woocommerce-name-your-price', value: 'woocommerce-name-your-price', type: 'public' },
	{ label: 'woocommerce-product-addons', value: 'woocommerce-product-addons', type: 'public' },
	{ label: 'woocommerce-checkout-add-ons', value: 'woocommerce-checkout-add-ons', type: 'public' },
	{ label: 'woocommerce-deposits', value: 'woocommerce-deposits', type: 'public' },
	{ label: 'woocommerce-conditional-shipping-and-payments', value: 'woocommerce-conditional-shipping-and-payments', type: 'public' },
	{ label: 'woocommerce-advanced-notifications', value: 'woocommerce-advanced-notifications', type: 'public' },
	{ label: 'woocommerce-bulk-stock-management', value: 'woocommerce-bulk-stock-management', type: 'public' },
	{ label: 'woocommerce-cost-of-goods', value: 'woocommerce-cost-of-goods', type: 'public' },
	{ label: 'woocommerce-customer-order-csv-export', value: 'woocommerce-customer-order-csv-export', type: 'public' },
	{ label: 'woocommerce-order-barcodes', value: 'woocommerce-order-barcodes', type: 'public' },
	{ label: 'woocommerce-pdf-product-vouchers', value: 'woocommerce-pdf-product-vouchers', type: 'public' },
	{ label: 'woocommerce-points-and-rewards', value: 'woocommerce-points-and-rewards', type: 'public' },
	{ label: 'woocommerce-product-csv-import-suite', value: 'woocommerce-product-csv-import-suite', type: 'public' },
	{ label: 'woocommerce-product-vendors', value: 'woocommerce-product-vendors', type: 'public' },
	{ label: 'woocommerce-shipment-tracking', value: 'woocommerce-shipment-tracking', type: 'public' },
	{ label: 'woocommerce-shipping-per-product', value: 'woocommerce-shipping-per-product', type: 'public' },
	{ label: 'woocommerce-table-rate-shipping', value: 'woocommerce-table-rate-shipping', type: 'public' },
	{ label: 'woocommerce-waitlist', value: 'woocommerce-waitlist', type: 'public' },
	{ label: 'woocommerce-wholesale-prices', value: 'woocommerce-wholesale-prices', type: 'public' },
];

export function WizardHatPluginManagement() {
	console.log('WIZARD HAT PLUGIN MANAGEMENT COMPONENT LOADED - TIMESTAMP:', Date.now());
	
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const { startServer, loadingServer } = useSiteDetails();
	const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
	const [installing, setInstalling] = useState(false);
	const [githubToken, setGithubToken] = useState('');
	const [tokenValid, setTokenValid] = useState(false);
	const [premiumPlugins, setPremiumPlugins] = useState<PluginOption[]>([]);
	const [loadingPremiumPlugins, setLoadingPremiumPlugins] = useState(false);
	const [installationLog, setInstallationLog] = useState<string[]>([]);

	if (!selectedSite) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{__('Plugin Management')}
					</h2>
					<p className="text-gray-600 mb-6">
						{__('Please select a site to manage plugins.')}
					</p>
				</div>
			</div>
		);
	}

	const isLoading = selectedSite?.id ? loadingServer[selectedSite.id] : false;

	useEffect(() => {
		// Load saved GitHub token
		const savedToken = localStorage.getItem('wizard-hat-github-token');
		if (savedToken) {
			setGithubToken(savedToken);
			validateToken(savedToken);
		}
	}, []);

	const validateToken = async (token: string) => {
		try {
			if (token.length === 0) {
				setTokenValid(false);
				return;
			}

			console.log('🚀🚀🚀 VALIDATING GITHUB TOKEN VIA IPC 🚀🚀🚀');
			
			// Use the new IPC handler for token validation
			const result = await getIpcApi().validateGitHubToken(token);
			
			console.log('🚀🚀🚀 TOKEN VALIDATION RESULT:', result);

			if (result.valid) {
				console.log('GitHub token validated for user:', result.user);
				setTokenValid(true);
				await loadPremiumPlugins(token);
			} else {
				console.error('GitHub token validation failed:', result.error);
				setTokenValid(false);
				setPremiumPlugins([]);
			}
		} catch (error) {
			console.error('Token validation error:', error);
			setTokenValid(false);
			setPremiumPlugins([]);
		}
	};

	const loadPremiumPlugins = async (token: string) => {
		setLoadingPremiumPlugins(true);
		try {
			// In a real implementation, this would fetch from WooCommerce's private repositories
			// For now, we'll simulate with some premium plugin names
			const premiumOptions: PluginOption[] = [
				{ label: 'woocommerce-subscriptions', value: 'woocommerce-subscriptions', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
				{ label: 'woocommerce-bookings', value: 'woocommerce-bookings', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
				{ label: 'woocommerce-memberships', value: 'woocommerce-memberships', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
				{ label: 'woocommerce-product-bundles', value: 'woocommerce-product-bundles', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
				{ label: 'woocommerce-composite-products', value: 'woocommerce-composite-products', type: 'premium', repository: 'https://github.com/woocommerce/all-plugins' },
			];
			setPremiumPlugins(premiumOptions);
		} catch (error) {
			console.error('Error loading premium plugins:', error);
		} finally {
			setLoadingPremiumPlugins(false);
		}
	};

	const handleTokenChange = (token: string) => {
		setGithubToken(token);
		localStorage.setItem('wizard-hat-github-token', token);
		validateToken(token);
	};

	const togglePlugin = (pluginValue: string) => {
		setSelectedPlugins(prev => 
			prev.includes(pluginValue)
				? prev.filter(p => p !== pluginValue)
				: [...prev, pluginValue]
		);
	};

	const installSelectedPlugins = async () => {
		console.log('🚀🚀🚀 INSTALL SELECTED PLUGINS FUNCTION CALLED - NEW CODE VERSION 🚀🚀🚀');
		console.log('🚀🚀🚀 TIMESTAMP:', new Date().toISOString());
		console.log('🚀🚀🚀 SELECTED PLUGINS:', selectedPlugins);
		
		if (selectedPlugins.length === 0 || installing) return;

		setInstalling(true);
		setInstallationLog([]);

		try {
			// Ensure site is running
			if (!selectedSite.running) {
				await startServer(selectedSite.id);
			}

			const allPlugins = [...COMMON_WOOCOMMERCE_PLUGINS, ...premiumPlugins];
			const pluginsToInstall = allPlugins.filter(plugin => selectedPlugins.includes(plugin.value));
			
			console.log('🚀🚀🚀 PLUGINS TO INSTALL:', pluginsToInstall);
			
			const results = {
				success: [] as string[],
				failed: [] as { plugin: string; error: string }[]
			};

			// Install each plugin
			for (const plugin of pluginsToInstall) {
				try {
					setInstallationLog(prev => [...prev, `Installing ${plugin.label}...`]);
					
					if (plugin.type === 'premium') {
						console.log('🚀🚀🚀 PREMIUM PLUGIN DETECTED - USING NEW CODE PATH 🚀🚀🚀');
						console.log('🚀🚀🚀 PLUGIN:', plugin.label);
						console.log('🚀🚀🚀 REPOSITORY:', plugin.repository);
						
						// Handle premium plugins from private repositories
						if (!githubToken) {
							throw new Error('GitHub token required for premium plugins');
						}

						console.log(`[Wizard Hat Frontend] Installing premium plugin: ${plugin.label}`);
						console.log(`[Wizard Hat Frontend] Repository: ${plugin.repository}`);
						console.log(`[Wizard Hat Frontend] Site ID: ${selectedSite.id}`);

						// Use the new IPC handler for private repository installation
						try {
							console.log(`[Wizard Hat Frontend] About to call installPluginFromPrivateRepo`);
							const result = await getIpcApi().installPluginFromPrivateRepo({
								siteId: selectedSite.id,
								repositoryUrl: plugin.repository!,
								githubToken,
								pluginName: plugin.label,
							});
							console.log(`[Wizard Hat Frontend] Installation result:`, result);

							if (!result.success) {
								throw new Error(result.error || 'Failed to install premium plugin');
							}

							results.success.push(plugin.label);
							setInstallationLog(prev => [...prev, `✅ ${plugin.label} installed successfully`]);
						} catch (error) {
							console.error(`[Wizard Hat Frontend] Error installing premium plugin ${plugin.label}:`, error);
							results.failed.push({ plugin: plugin.label, error: error instanceof Error ? error.message : String(error) });
							setInstallationLog(prev => [...prev, `❌ ${plugin.label} failed: ${error instanceof Error ? error.message : String(error)}`]);
						}
					} else {
						console.log('🚀🚀🚀 PUBLIC PLUGIN - USING OLD CODE PATH 🚀🚀🚀');
						console.log('🚀🚀🚀 PLUGIN:', plugin.label);
						
						// Handle public plugins with the original method
						const result = await getIpcApi().executeWPCLiInline({
							siteId: selectedSite.id,
							args: `plugin install ${plugin.value} --activate`,
						});

						if (result.exitCode === 0) {
							results.success.push(plugin.label);
							setInstallationLog(prev => [...prev, `✅ ${plugin.label} installed successfully`]);
						} else {
							results.failed.push({ plugin: plugin.label, error: result.stderr });
							setInstallationLog(prev => [...prev, `❌ ${plugin.label} failed: ${result.stderr}`]);
						}
					}
				} catch (error) {
					console.error(`Error installing ${plugin.label}:`, error);
					results.failed.push({ plugin: plugin.label, error: error instanceof Error ? error.message : String(error) });
					setInstallationLog(prev => [...prev, `❌ ${plugin.label} failed: ${error instanceof Error ? error.message : String(error)}`]);
				}
			}

			// Show final results
			if (results.success.length > 0) {
				setInstallationLog(prev => [...prev, `\n✅ Successfully installed: ${results.success.join(', ')}`]);
			}
			if (results.failed.length > 0) {
				setInstallationLog(prev => [...prev, `\n❌ Failed to install: ${results.failed.map(f => f.plugin).join(', ')}`]);
			}
		} catch (error) {
			console.error('Error during plugin installation:', error);
			setInstallationLog(prev => [...prev, `❌ Installation failed: ${error instanceof Error ? error.message : String(error)}`]);
		} finally {
			setInstalling(false);
		}
	};

	const installWooCommercePaymentsDevTools = async () => {
		setInstalling(true);

		try {
			// Ensure site is running
			if (!selectedSite.running) {
				await startServer(selectedSite.id);
			}

			// Install WooCommerce Payments Dev Tools
			await getIpcApi().executeWPCLiInline({
				siteId: selectedSite.id,
				args: 'plugin install https://github.com/Automattic/woocommerce-payments-dev-tools/archive/refs/heads/trunk.zip --activate --force',
			});

			// Set dev tool options
			const devOptions = [
				'wcpaydev_proxy false',
				'wcpaydev_redirect false',
				'wcpaydev_redirect_localhost false',
				'wcpaydev_display_notice true',
			];

			for (const option of devOptions) {
				await getIpcApi().executeWPCLiInline({
					siteId: selectedSite.id,
					args: `option set ${option}`,
				});
			}

			getIpcApi().showNotification({
				title: __('Success'),
				body: __('WooCommerce Payments Dev Tools installed successfully'),
			});
		} catch (error) {
			console.error('Error installing dev tools:', error);
			getIpcApi().showErrorMessageBox({
				title: __('Error'),
				message: __('Failed to install WooCommerce Payments Dev Tools. Please try again.'),
				error,
			});
		} finally {
			setInstalling(false);
		}
	};

	return (
		<div className="space-y-8">
			<div className="max-w-3xl">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">
					{__('Plugin Management')}
				</h2>
				<p className="text-gray-600 mb-6">
					{__('Install and manage WooCommerce plugins, including premium plugins from private repositories.')}
				</p>
			</div>

			{/* GitHub Token Section */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('GitHub Token (for Premium Plugins)')}
				</h3>
				<p className="text-gray-600 mb-4">
					{__('Some plugins require access to private GitHub repositories. Enter your GitHub token with "repo" scope to access premium plugins.')}
				</p>
				<div className="flex gap-4 items-end">
					<TextControl
						type="password"
						label={__('GitHub Token')}
						value={githubToken}
						onChange={handleTokenChange}
						placeholder="ghp_..."
						className="flex-1"
					/>
					<Button
						variant="secondary"
						onClick={() => getIpcApi().openURL('https://github.com/settings/tokens/new')}
					>
						{__('Create Token')}
					</Button>
				</div>
				{tokenValid && (
					<p className="text-green-600 text-sm mt-2">
						{__('✓ Token is valid')}
					</p>
				)}
			</Card>

			{/* Quick Install Section */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('Quick Install')}
				</h3>
				<div className="space-y-4">
					<Button
						variant="primary"
						onClick={installWooCommercePaymentsDevTools}
						disabled={isLoading || installing}
					>
						{installing ? __('Installing...') : __('Install WooCommerce Payments Dev Tools')}
					</Button>
				</div>
			</Card>

			{/* Plugin Selection Section */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('Select Plugins to Install')}
				</h3>
				
				{/* Common Plugins */}
				<div className="mb-6">
					<h4 className="text-md font-medium text-gray-700 mb-3">
						{__('Common WooCommerce Plugins')}
					</h4>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
						{COMMON_WOOCOMMERCE_PLUGINS.map((plugin) => (
							<label
								key={plugin.value}
								className="flex items-center space-x-2 p-2 rounded border hover:bg-gray-50 cursor-pointer"
							>
								<input
									type="checkbox"
									checked={selectedPlugins.includes(plugin.value)}
									onChange={() => togglePlugin(plugin.value)}
									className="rounded"
								/>
								<span className="text-sm">{plugin.label}</span>
							</label>
						))}
					</div>
				</div>

				{/* Premium Plugins */}
				{tokenValid && (
					<div className="mb-6">
						<h4 className="text-md font-medium text-gray-700 mb-3">
							{__('Premium Plugins')}
						</h4>
						{loadingPremiumPlugins ? (
							<p className="text-gray-600">{__('Loading premium plugins...')}</p>
						) : (
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
								{premiumPlugins.map((plugin) => (
									<label
										key={plugin.value}
										className="flex items-center space-x-2 p-2 rounded border hover:bg-gray-50 cursor-pointer bg-blue-50"
									>
										<input
											type="checkbox"
											checked={selectedPlugins.includes(plugin.value)}
											onChange={() => togglePlugin(plugin.value)}
											className="rounded"
										/>
										<span className="text-sm font-medium">{plugin.label}</span>
									</label>
								))}
							</div>
						)}
					</div>
				)}

				{/* Install Button */}
				<div className="flex justify-between items-center">
					<span className="text-sm text-gray-600">
						{selectedPlugins.length > 0 && `${selectedPlugins.length} plugin(s) selected`}
					</span>
					<Button
						variant="primary"
						onClick={installSelectedPlugins}
						disabled={selectedPlugins.length === 0 || isLoading || installing}
					>
						{installing ? __('Installing...') : __('Install Selected Plugins')}
					</Button>
				</div>
			</Card>

			{/* Information Section */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-blue-900 mb-2">
					{__('Plugin Information')}
				</h3>
				<ul className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Plugins will be installed and activated automatically')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Premium plugins require a valid GitHub token with "repo" scope')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('WooCommerce Payments Dev Tools enables local payment testing')}</span>
					</li>
				</ul>
			</div>

			{/* Installation Log Section */}
			{installationLog.length > 0 && (
				<Card className="p-6">
					<h3 className="text-lg font-medium text-gray-900 mb-4">
						{__('Installation Log')}
					</h3>
					<div className="bg-gray-50 border rounded-lg p-4 max-h-64 overflow-y-auto">
						{installationLog.map((log, index) => (
							<div key={index} className="text-sm font-mono mb-1">
								{log}
							</div>
						))}
					</div>
				</Card>
			)}
		</div>
	);
} 