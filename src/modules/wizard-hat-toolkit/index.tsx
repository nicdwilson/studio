import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { useState, createContext, useContext } from 'react';
import { WizardHatOverview } from './components/wizard-hat-overview';
import { WizardHatJurassicTube } from './components/wizard-hat-jurassic-tube';
import { WizardHatShopConfig } from './components/wizard-hat-shop-config';
import { WizardHatPluginManagement } from './components/wizard-hat-plugin-management';
import { WizardHatTools } from './components/wizard-hat-tools';
import { WizardHatImportBlueprint } from './components/wizard-hat-import-blueprint';
import { useSiteDetails } from 'src/hooks/use-site-details';

export type WizardHatTabName =
	| 'overview'
	| 'shop-config'
	| 'plugin-management'
	| 'tools'
	| 'import-blueprint'
	| 'jurassic-tube';

interface WizardHatTab {
	name: WizardHatTabName;
	label: string;
	component: React.ComponentType;
}

const tabs: WizardHatTab[] = [
	{
		name: 'overview',
		label: __( 'Overview' ),
		component: WizardHatOverview,
	},
	{
		name: 'shop-config',
		label: __( 'Shop Switcher' ),
		component: WizardHatShopConfig,
	},
	{
		name: 'plugin-management',
		label: __( 'Plugins' ),
		component: WizardHatPluginManagement,
	},
	{
		name: 'tools',
		label: __( 'Tools' ),
		component: WizardHatTools,
	},
	{
		name: 'import-blueprint',
		label: __( 'Import Blueprint' ),
		component: WizardHatImportBlueprint,
	},
	{
		name: 'jurassic-tube',
		label: __( 'Jurassic Tube' ),
		component: WizardHatJurassicTube,
	},
];

interface WizardHatContextType {
	selectedTab: WizardHatTabName;
	setSelectedTab: ( tab: WizardHatTabName ) => void;
	tabs: WizardHatTab[];
}

const WizardHatContext = createContext< WizardHatContextType | null >( null );

export function useWizardHatTabs() {
	const context = useContext( WizardHatContext );
	if ( ! context ) {
		throw new Error( 'useWizardHatTabs must be used within a WizardHatProvider' );
	}
	return context;
}

export function WizardHatToolkit() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const [ selectedTab, setSelectedTab ] = useState< WizardHatTabName >( tabs[ 0 ].name );

	if ( ! selectedSite ) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{ __( 'Wizard Hat Toolkit' ) }
					</h2>
					<p className="text-gray-600 mb-6">
						{ __( 'Please select a site to use the Wizard Hat Toolkit.' ) }
					</p>
				</div>
			</div>
		);
	}

	const contextValue: WizardHatContextType = {
		selectedTab,
		setSelectedTab,
		tabs,
	};

	return (
		<WizardHatContext.Provider value={ contextValue }>
			<div className="space-y-6">
				{ /* Tab Navigation */ }
				<div className="border-b border-gray-200">
					<nav className="-mb-px flex space-x-8 px-4">
						{ tabs.map( ( tab ) => (
							<button
								key={ tab.name }
								onClick={ () => setSelectedTab( tab.name ) }
								className={ `py-2 px-1 border-b-2 font-medium text-sm ${
									selectedTab === tab.name
										? 'border-blue-500 text-blue-600'
										: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
								}` }
							>
								{ tab.label }
							</button>
						) ) }
					</nav>
				</div>

				{ /* Tab Content */ }
				<div className="mt-6">
					{ ( () => {
						const TabComponent = tabs.find( ( tab ) => tab.name === selectedTab )?.component;
						return TabComponent ? <TabComponent /> : null;
					} )() }
				</div>
			</div>
		</WizardHatContext.Provider>
	);
}
